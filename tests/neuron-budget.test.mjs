import test from "node:test";
import assert from "node:assert/strict";
import { buildQuotaSettlement, estimateGlm47FlashNeurons, MINIMUM_CALL_RESERVATION_NEURONS } from "../agent/lib/neuron-budget.mjs";

test("GLM-4.7-Flash estimate uses published rates and a safety margin without flooring valid usage", () => {
  assert.equal(estimateGlm47FlashNeurons(0, 0), 0);
  assert.equal(estimateGlm47FlashNeurons(16384, 1024), 192);
  assert.equal(estimateGlm47FlashNeurons(undefined, 10), MINIMUM_CALL_RESERVATION_NEURONS);
  assert.ok(estimateGlm47FlashNeurons(100000, 5000) > 200);
});

test("quota settlement includes complete provider token counts and labels missing usage as fallback", () => {
  assert.deepEqual(buildQuotaSettlement({
    inputTokens: { total: 12000 }, outputTokens: { total: 300 },
  }, "completed"), {
    actual_neurons: estimateGlm47FlashNeurons(12000, 300),
    accounting_source: "provider_usage",
    settlement_reason: "completed",
    input_tokens: 12000,
    output_tokens: 300,
  });

  assert.deepEqual(buildQuotaSettlement({
    inputTokens: { total: 12000 },
  }, "completed"), {
    actual_neurons: MINIMUM_CALL_RESERVATION_NEURONS,
    accounting_source: "fallback",
    settlement_reason: "completed_without_usage",
  });
});

test("quota settlement preserves explicit provider, stream, and cancellation failure reasons", () => {
  for (const reason of ["provider_error", "stream_interrupted", "cancelled"]) {
    assert.deepEqual(buildQuotaSettlement(undefined, reason), {
      actual_neurons: MINIMUM_CALL_RESERVATION_NEURONS,
      accounting_source: "fallback",
      settlement_reason: reason,
    });
  }
});
