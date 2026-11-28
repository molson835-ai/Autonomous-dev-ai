import assert from "node:assert/strict";
import test from "node:test";
import {
  GEMINI_FREE_TIER_MODEL,
  isGeminiFreeTierFallbackEnabled,
  isLocalNeuronBudgetFallback
} from "../agent/lib/gemini-fallback-policy.mjs";

test("Gemini fallback is disabled unless explicitly enabled with no billing account and a key", () => {
  assert.equal(GEMINI_FREE_TIER_MODEL, "gemini-3.8-flash");
  assert.equal(isGeminiFreeTierFallbackEnabled({ apiKey: "key", enabled: "true", billingAccountAttached: "false" }), true);
  assert.equal(isGeminiFreeTierFallbackEnabled({ apiKey: "key", enabled: "true", billingAccountAttached: "true" }), false);
  assert.equal(isGeminiFreeTierFallbackEnabled({ apiKey: "key", enabled: "true" }), false);
  assert.equal(isGeminiFreeTierFallbackEnabled({ apiKey: "key", enabled: "false", billingAccountAttached: "false" }), false);
  assert.equal(isGeminiFreeTierFallbackEnabled({ apiKey: "", enabled: "true", billingAccountAttached: "false" }), false);
  assert.equal(isGeminiFreeTierFallbackEnabled({ enabled: "true", billingAccountAttached: "false" }), false);
});

test("only the explicit local neuron target response may use Gemini", () => {
  assert.equal(isLocalNeuronBudgetFallback({
    name: "EVEQuotaReservationError",
    reason_code: "local_neuron_budget_reached"
  }), true);
  for (const error of [
    { name: "EVEQuotaReservationError", reason_code: "quota_circuit_open" },
    { name: "EVEQuotaReservationError", reason_code: "quota_telemetry_unavailable" },
    { name: "EVEQuotaGuardError", reason_code: "local_neuron_budget_reached" },
    { name: "Error", reason_code: "local_neuron_budget_reached" },
    { name: "EVEQuotaReservationError", reason_code: "unclassified" },
    null,
    undefined
  ]) {
    assert.equal(isLocalNeuronBudgetFallback(error), false);
  }
});
