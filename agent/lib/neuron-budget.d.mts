export declare const MINIMUM_CALL_RESERVATION_NEURONS: number;

/**
 * Estimates GLM-4.7-Flash neuron usage from input/output token counts,
 * applying the published-rate safety margin and minimum reservation.
 */
export declare function estimateGlm47FlashNeurons(
  inputTokens: number,
  outputTokens: number,
): number;
