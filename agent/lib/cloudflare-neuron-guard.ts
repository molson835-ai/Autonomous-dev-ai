import type { LanguageModelV4, LanguageModelV4Middleware } from "@ai-sdk/provider";
import { memoryRequest } from "./memory-client";
import { buildQuotaSettlement } from "./neuron-budget.mjs";
import { handleStreamReadFailure } from "./stream-quota-error.mjs";
import { summarizeModelInput, summarizeModelUsage } from "./model-input-profile.mjs";
import { isLocalNeuronBudgetFallback } from "./gemini-fallback-policy.mjs";
const MODEL_ID = "@cf/zai-org/glm-4.7-flash";
const GEMINI_MODEL_ID = "gemini-3.8-flash";
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

function nonRetryableGeminiError(cause: unknown): Error {
  const error = new Error("EVE's Gemini free-tier fallback failed or reached its limit. Model work is paused; no retry or paid provider will be attempted.");
  error.name = "EVEGeminiFallbackError";
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
}

async function reserve() {
  // The Worker owns the shared UTC-day ledger. Reservation size is fixed server-side;
  // settlement usage is estimated in this trusted middleware from provider-reported tokens.
  const result = await memoryRequest<{ reservation_id: string }>("/v1/quota/reserve", {
    method: "POST",
    body: { reserve_neurons: RESERVATION_NEURONS, model_id: MODEL_ID },
  });
  if (!result?.reservation_id) return stop("Shared quota reservation was not issued.");
  return result.reservation_id;
}
function logInputProfile(
  params: { prompt?: unknown[]; tools?: unknown[] },
  usage?: unknown,
  model = MODEL_ID,
) {
  console.info("EVE_MODEL_INPUT_PROFILE", {
    model,
    environment: process.env.VERCEL_ENV ?? "unknown",
    ...summarizeModelInput(params as Parameters<typeof summarizeModelInput>[0]),
    ...summarizeModelUsage(usage),
  });
}
async function settle(
  id: string,
  usage?: { inputTokens?: { total?: number }; outputTokens?: { total?: number } },
  reason: "completed" | "provider_error" | "stream_interrupted" | "cancelled" = "stream_interrupted",
) {
  await memoryRequest("/v1/quota/settle", {
    method: "POST",
    body: { reservation_id: id, ...buildQuotaSettlement(usage, reason) },
  });
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

export function createCloudflareNeuronGuard(fallbackModel?: LanguageModelV4): LanguageModelV4Middleware {
  return {
    specificationVersion: "v4",
    transformParams: async ({ params }) => ({
      ...params, maxOutputTokens: Math.min(params.maxOutputTokens ?? MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS),
    }),
    wrapGenerate: async ({ doGenerate, params }) => {
      let id: string;
      try {
        id = await reserve();
      } catch (error) {
        // Gemini is eligible only for Eve's local safety-target block. Actual
        // Cloudflare quota exhaustion and every other reservation failure stop.
        if (fallbackModel && isLocalNeuronBudgetFallback(error)) {
          console.warn("EVE_MODEL_FALLBACK", { from: MODEL_ID, to: GEMINI_MODEL_ID, reason: "local_neuron_budget_reached" });
          try {
            const result = await fallbackModel.doGenerate(params);
            logInputProfile(params, result.usage, GEMINI_MODEL_ID);
            return result;
          } catch (fallbackError) {
            throw nonRetryableGeminiError(fallbackError);
          }
        }
        throw error;
      }
      let result;
      try { result = await doGenerate(); }
      catch (error) { logInputProfile(params); if (isQuotaError(error)) { await circuit(id); throw nonRetryableQuotaError(error); } await settle(id, undefined, "provider_error"); throw error; }
      logInputProfile(params, result.usage);
      await settle(id, result.usage, "completed");
      return result;
    },
    wrapStream: async ({ doStream, params }) => {
      let id: string;
      try {
        id = await reserve();
      } catch (error) {
        if (fallbackModel && isLocalNeuronBudgetFallback(error)) {
          console.warn("EVE_MODEL_FALLBACK", { from: MODEL_ID, to: GEMINI_MODEL_ID, reason: "local_neuron_budget_reached" });
          try {
            const result = await fallbackModel.doStream(params);
            logInputProfile(params, undefined, GEMINI_MODEL_ID);
            const reader = result.stream.getReader();
            const stream = new ReadableStream({
              async pull(controller) {
                try {
                  const next = await reader.read();
                  if (next.done) {
                    reader.releaseLock();
                    controller.close();
                    return;
                  }
                  controller.enqueue(next.value);
                } catch (streamError) {
                  try { reader.releaseLock(); } catch { /* Reader may already be released. */ }
                  controller.error(nonRetryableGeminiError(streamError));
                }
              },
              async cancel(reason) {
                try { await reader.cancel(reason); }
                finally { try { reader.releaseLock(); } catch { /* Reader may already be released. */ } }
              },
            }) as typeof result.stream;
            return { ...result, stream };
          } catch (fallbackError) {
            if ((fallbackError as Error)?.name === "EVEGeminiFallbackError") throw fallbackError;
            throw nonRetryableGeminiError(fallbackError);
          }
        }
        throw error;
      }
      let result;
      try { result = await doStream(); }
      catch (error) { logInputProfile(params); if (isQuotaError(error)) { await circuit(id); throw nonRetryableQuotaError(error); } await settle(id, undefined, "provider_error"); throw error; }
      let settled = false;
      let profiled = false;
      const profileOnce = (usage?: unknown) => {
        if (profiled) return;
        profiled = true;
        logInputProfile(params, usage);
      };
      const reader = result.stream.getReader();
      const stream = new ReadableStream({
        async pull(controller) {
          try {
            const next = await reader.read();
            if (next.done) {
              profileOnce();
              if (!settled) { settled = true; await settle(id, undefined, "completed"); }
              reader.releaseLock();
              controller.close();
              return;
            }
            if (next.value.type === "finish" && !settled) {
              settled = true;
              profileOnce(next.value.usage);
              await settle(id, next.value.usage, "completed");
            }
            controller.enqueue(next.value);
          } catch (error) {
            if (!settled) {
              settled = true;
              profileOnce();
              try {
                await handleStreamReadFailure({
                  error,
                  reservationId: id,
                  settle: async (reservationId) => settle(reservationId, undefined, "stream_interrupted"),
                  circuit: async (reservationId) => circuit(reservationId),
                  isQuotaError,
                  nonRetryableQuotaError,
                });
              } catch (handledError) {
                error = handledError;
              }
            }
            try { reader.releaseLock(); } catch { /* Reader may already be released. */ }
            controller.error(error);
          }
        },
        async cancel(reason) {
          try { await reader.cancel(reason); }
          finally {
            profileOnce();
            if (!settled) { settled = true; await settle(id, undefined, "cancelled"); }
            try { reader.releaseLock(); } catch { /* Reader may already be released. */ }
          }
        },
      }) as typeof result.stream;
      // Interrupted streams settle conservatively with the unknown-usage fallback.
      return { ...result, stream };
    },
  };
}
