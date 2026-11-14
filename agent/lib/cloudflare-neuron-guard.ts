import type { LanguageModelV4Middleware } from "@ai-sdk/provider";
import { memoryRequest } from "./memory-client";
import { estimateGlm47FlashNeurons } from "./neuron-budget.mjs";
const MODEL_ID = "@cf/zai-org/glm-4.7-flash";
const MAX_OUTPUT_TOKENS = 1024;
const RESERVATION_NEURONS = 200;
function stop(reason: string): never { throw new Error("EVE quota guard paused model work: " + reason); }

async function accountUsage() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) stop("Cloudflare Analytics credentials unavailable.");
  const day = new Date().toISOString().slice(0, 10);
  const query = "query { viewer { accounts(filter: { accountTag: \"" + accountId + "\" }) { " +
    "aiInferenceAdaptiveGroups(limit: 2, filter: { date_geq: \"" + day + "\", date_leq: \"" + day + "\" }, dimensions: [date]) " +
    "{ sum { totalNeurons } dimensions { date } } } } }";
  let response: Response;
  try {
    response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ query }), signal: AbortSignal.timeout(8000), cache: "no-store",
    });
  } catch { return stop("Cloudflare account analytics unavailable."); }
  if (!response.ok) return stop("Cloudflare account analytics HTTP " + response.status + ".");
  let payload: any;
  try { payload = await response.json(); } catch { return stop("Cloudflare account analytics response invalid."); }
  if (payload?.errors?.length) return stop("Cloudflare account analytics query or permissions failed.");
  const accounts = payload?.data?.viewer?.accounts;
  const groups = accounts?.length === 1 ? accounts[0]?.aiInferenceAdaptiveGroups : null;
  if (!Array.isArray(groups) || groups.length > 1) return stop("Cloudflare daily aggregate missing or ambiguous.");
  const usedNeurons = groups.length === 0 ? 0 : groups[0]?.sum?.totalNeurons;
  if (typeof usedNeurons !== "number" || !Number.isFinite(usedNeurons) || usedNeurons < 0)
    return stop("Authoritative neuron total missing.");
  return { day, usedNeurons, observedAt: new Date().toISOString() };
}

async function reserve() {
  const observation = await accountUsage();
  const result = await memoryRequest<{ reservation_id: string }>("/v1/quota/reserve", {
    method: "POST", body: { ...observation, reserve_neurons: RESERVATION_NEURONS, model_id: MODEL_ID },
  });
  if (!result?.reservation_id) return stop("Shared quota reservation was not issued.");
  return result.reservation_id;
}
async function settle(id: string, usage?: { inputTokens?: { total?: number }; outputTokens?: { total?: number } }) {
  await memoryRequest("/v1/quota/settle", { method: "POST", body: {
    reservation_id: id,
    actual_neurons: estimateGlm47FlashNeurons(usage?.inputTokens?.total, usage?.outputTokens?.total),
  }});
}
async function circuit(id: string) {
  try { await memoryRequest("/v1/quota/circuit", { method: "POST", body: {
    reservation_id: id, reason: "cloudflare_daily_quota_exhausted",
  }}); } catch { /* Outstanding reservation remains fail-closed. */ }
}
function isQuotaError(error: unknown) {
  const e = error as any;
  return /\b4006\b|daily free allocation|neurons? (?:allocation|limit|quota|exhausted)/i
    .test([e?.code,e?.message,e?.cause?.code,e?.cause?.message].join(" "));
}
export function createCloudflareNeuronGuard(): LanguageModelV4Middleware {
  return {
    specificationVersion: "v4",
    transformParams: async ({ params }) => ({
      ...params, maxOutputTokens: Math.min(params.maxOutputTokens ?? MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS),
    }),
    wrapGenerate: async ({ doGenerate }) => {
      const id = await reserve();
      let result;
      try { result = await doGenerate(); }
      catch (error) { if (isQuotaError(error)) await circuit(id); else await settle(id); throw error; }
      await settle(id, result.usage);
      return result;
    },
    wrapStream: async ({ doStream }) => {
      const id = await reserve();
      let result;
      try { result = await doStream(); }
      catch (error) { if (isQuotaError(error)) await circuit(id); else await settle(id); throw error; }
      let settled = false;
      const stream = result.stream.pipeThrough(new TransformStream({
        async transform(part, controller) {
          if (part.type === "finish" && !settled) { settled = true; await settle(id, part.usage); }
          controller.enqueue(part);
        },
      }));
      // A cancelled stream retains its reservation for the UTC day.
      return { ...result, stream };
    },
  };
}
