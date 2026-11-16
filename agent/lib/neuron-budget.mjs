const INPUT_RATE = 5500, OUTPUT_RATE = 36400, MARGIN = 1.5;
export const MINIMUM_CALL_RESERVATION_NEURONS = 200;
/** GLM-4.7-Flash estimate from Cloudflare's published neuron rates, with margin. */
export function estimateGlm47FlashNeurons(inputTokens, outputTokens) {
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens) || inputTokens < 0 || outputTokens < 0)
    return MINIMUM_CALL_RESERVATION_NEURONS;
  return Math.ceil(((inputTokens * INPUT_RATE + outputTokens * OUTPUT_RATE) / 1_000_000) * MARGIN);
}
