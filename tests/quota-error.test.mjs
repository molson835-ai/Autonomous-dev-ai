import test from "node:test";
import assert from "node:assert/strict";
import { memoryFailureMessage } from "../agent/lib/quota-error.mjs";

test("quota budget exhaustion is distinguished from provider quota circuit", () => {
  assert.match(memoryFailureMessage(429, { reason_code: "local_neuron_budget_reached" }), /local neuron safety budget/i);
  assert.match(memoryFailureMessage(429, { reason_code: "quota_circuit_open" }), /provider.*quota/i);
});

test("quota telemetry and unknown errors remain explicit and safe", () => {
  assert.match(memoryFailureMessage(503, { reason_code: "quota_telemetry_unavailable" }), /cannot verify/i);
  assert.equal(memoryFailureMessage(429, { error: "untrusted raw response" }), "Persistent memory request failed (429).");
  assert.doesNotMatch(memoryFailureMessage(500, { error: "secret token" }), /secret token/);
});
