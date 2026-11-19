import type { LanguageModelV4Middleware } from "@ai-sdk/provider";
import { memoryRequest } from "./memory-client";
import { estimateGlm47FlashNeurons } from "./neuron-budget.mjs";
const MODEL_ID = "@cf/zai-org/glm-4.7-flash";
const MAX_OUTPUT_TOKENS = 1024;
const RESERVATION_NEURONS = 200;
function stop(reason: string): never { throw new Error("EVE quota guard paused model work: " + reason); }

// Deliberately throw a plain Error for provider quota exhaustion. The AI SDK's
// retry policy retries retryable APICallError instances, not arbitrary Errors.
// This prevents a second provider request even if circuit persistence fails.
export function nonRetryableQuotaError(cause: unknown): Error {
  const error = new Error("EVE stopped this model request because the Cloudflare daily neuron allocation is exhausted.");
  error.name = "EVEQuotaExhaustedError";
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
}

async function reserve() {
  // The Worker queries Cloudflare Analytics with its own read-only credential.
  // Eve supplies no usage total or timestamp that it could underreport.
  const result = await memoryRequest<{ reservation_id: string }>("/v1/quota/reserve", {
    method: "POST",
    body: { reserve_neurons: RESERVATION_NEURONS, model_id: MODEL_ID },
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
      catch (error) { if (isQuotaError(error)) { await circuit(id); throw nonRetryableQuotaError(error); } await settle(id); throw error; }
      await settle(id, result.usage);
      return result;
    },
    wrapStream: async ({ doStream }) => {
      const id = await reserve();
      let result;
      try { result = await doStream(); }
      catch (error) { if (isQuotaError(error)) { await circuit(id); throw nonRetryableQuotaError(error); } await settle(id); throw error; }
      let settled = false;
      const reader = result.stream.getReader();
      const stream = new ReadableStream({
        async pull(controller) {
          try {
            const next = await reader.read();
            if (next.done) {
              if (!settled) { settled = true; await settle(id); }
              reader.releaseLock();
              controller.close();
              return;
            }
            if (next.value.type === "finish" && !settled) {
              settled = true;
              await settle(id, next.value.usage);
            }
            controller.enqueue(next.value);
          } catch (error) {
            if (!settled) {
              settled = true;
              try { await settle(id); } catch { /* Keep the reservation fail-closed. */ }
            }
            try { reader.releaseLock(); } catch { /* Reader may already be released. */ }
            controller.error(error);
          }
        },
        async cancel(reason) {
          try { await reader.cancel(reason); }
          finally {
            if (!settled) { settled = true; await settle(id); }
            try { reader.releaseLock(); } catch { /* Reader may already be released. */ }
          }
        },
      }) as typeof result.stream;
      // Interrupted streams settle conservatively with the unknown-usage fallback.
      return { ...result, stream };
    },
  };
}
