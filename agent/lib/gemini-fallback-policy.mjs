/**
 * Gemini fallback is deliberately opt-in and restricted to the one reviewed
 * free-tier model. A key alone never enables the provider.
 */
export const GEMINI_FREE_TIER_MODEL = "gemini-3.8-flash";

export function isGeminiFreeTierFallbackEnabled({
  apiKey,
  enabled,
  billingAccountAttached
} = {}) {
  return enabled === "true"
    && billingAccountAttached === "false"
    && typeof apiKey === "string"
    && apiKey.trim().length > 0;
}

/**
 * Only the shared local safety-target response may trigger Gemini.
 * Provider quota circuits, Cloudflare 4006, telemetry failures, and unknown
 * reservation failures must never be treated as eligible.
 */
export function isLocalNeuronBudgetFallback(error) {
  return error?.name === "EVEQuotaReservationError"
    && error?.reason_code === "local_neuron_budget_reached";
}
