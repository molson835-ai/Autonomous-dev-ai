const INPUT_RATE = 5500, OUTPUT_RATE = 36400, MARGIN = 1.5;
export const MINIMUM_CALL_RESERVATION_NEURONS = 200;

/** GLM-4.7-Flash estimate from Cloudflare's published neuron rates, with margin. */
export function estimateGlm47FlashNeurons(inputTokens, outputTokens) {
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens) || inputTokens < 0 || outputTokens < 0)
    return MINIMUM_CALL_RESERVATION_NEURONS;
  return Math.ceil(((inputTokens * INPUT_RATE + outputTokens * OUTPUT_RATE) / 1_000_000) * MARGIN);
}

/**
 * Build the Worker settlement payload without ever labeling missing or partial
 * usage as provider telemetry. Reasons are intentionally bounded to the
 * Worker ledger's accepted vocabulary.
 */
export function buildQuotaSettlement(usage, reason = "completed") {
  const inputTokens = usage?.inputTokens?.total;
  const outputTokens = usage?.outputTokens?.total;
  const hasProviderUsage =
    Number.isSafeInteger(inputTokens) && inputTokens >= 0 &&
    Number.isSafeInteger(outputTokens) && outputTokens >= 0;

  const settlementReason =
    reason === "completed" && !hasProviderUsage ? "completed_without_usage" : reason;

  return {
    actual_neurons: hasProviderUsage
      ? estimateGlm47FlashNeurons(inputTokens, outputTokens)
      : MINIMUM_CALL_RESERVATION_NEURONS,
    accounting_source: hasProviderUsage ? "provider_usage" : "fallback",
    settlement_reason: settlementReason,
    ...(hasProviderUsage ? { input_tokens: inputTokens, output_tokens: outputTokens } : {}),
  };
}
