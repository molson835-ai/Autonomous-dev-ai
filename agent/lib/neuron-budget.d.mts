export declare const MINIMUM_CALL_RESERVATION_NEURONS: number;

/**
 * Estimates GLM-4.7-Flash neuron usage from input/output token counts,
 * applying the published-rate safety margin and minimum reservation.
 * Missing token counts are handled conservatively by the minimum reservation.
 */
export declare function estimateGlm47FlashNeurons(
  inputTokens: number | undefined,
  outputTokens: number | undefined,
): number;

export type QuotaSettlementReason =
  | "completed"
  | "provider_error"
  | "stream_interrupted"
  | "cancelled"
  | "completed_without_usage"
  | "legacy_or_unknown";

/** Builds a bounded Worker settlement payload from complete provider token usage. */
export declare function buildQuotaSettlement(
  usage: {
    inputTokens?: { total?: number };
    outputTokens?: { total?: number };
  } | undefined,
  reason?: QuotaSettlementReason,
): {
  actual_neurons: number;
  accounting_source: "provider_usage" | "fallback";
  settlement_reason: QuotaSettlementReason;
  input_tokens?: number;
  output_tokens?: number;
};
