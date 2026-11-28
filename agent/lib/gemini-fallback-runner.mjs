import { isLocalNeuronBudgetFallback } from "./gemini-fallback-policy.mjs";

/** Keep fallback selection in a small, directly testable boundary. */
export function createGeminiFallbackError(cause) {
  const error = new Error("EVE's Gemini free-tier fallback failed or reached its limit. Model work is paused; no retry or paid provider will be attempted.");
  error.name = "EVEGeminiFallbackError";
  error.cause = cause;
  return error;
}

/**
 * Reserve Cloudflare first. Gemini can run only when the reservation itself
 * returns Eve's exact local safety-target reason; every other error is rethrown.
 */
export async function reserveOrRunWithGeminiFallback({
  reserve,
  fallbackModel,
  params,
  mode,
  onFallback,
}) {
  try {
    return { kind: "primary", reservationId: await reserve() };
  } catch (error) {
    if (!fallbackModel || !isLocalNeuronBudgetFallback(error)) throw error;
    if (mode !== "generate" && mode !== "stream") {
      throw new TypeError("Unsupported Gemini fallback operation.");
    }
    onFallback?.();
    try {
      const result = mode === "generate"
        ? await fallbackModel.doGenerate(params)
        : await fallbackModel.doStream(params);
      return { kind: "fallback", result };
    } catch (fallbackError) {
      throw createGeminiFallbackError(fallbackError);
    }
  }
}
