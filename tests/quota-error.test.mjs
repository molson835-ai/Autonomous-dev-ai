import test from "node:test";
import assert from "node:assert/strict";
import { memoryFailureDiagnostic, memoryFailureMessage } from "../agent/lib/quota-error.mjs";

test("quota budget exhaustion is distinguished from provider quota circuit", () => {
  assert.match(memoryFailureMessage(429, { reason_code: "local_neuron_budget_reached" }), /local neuron safety target/i);
  assert.match(memoryFailureMessage(429, { reason_code: "quota_circuit_open" }), /provider.*quota/i);
});

test("quota telemetry and unknown errors remain explicit and safe", () => {
  assert.match(memoryFailureMessage(503, { reason_code: "quota_telemetry_unavailable" }), /cannot verify/i);
  assert.equal(memoryFailureMessage(429, { error: "untrusted raw response" }), "Persistent memory request failed (429).");
  assert.doesNotMatch(memoryFailureMessage(500, { error: "secret token" }), /secret token/);
});

test("quota reservation failures carry safe diagnostic category and reason", () => {
  const error = memoryFailureDiagnostic(429, { reason_code: "quota_circuit_open" }, "/v1/quota/reserve");
  assert.equal(error.name, "EVEQuotaReservationError");
  assert.equal(error.category, "quota_reservation");
  assert.equal(error.reason_code, "quota_circuit_open");
  assert.match(error.message, /category=quota_reservation/);
  assert.match(error.message, /reason_code=quota_circuit_open/);
});

test("unknown response details are never copied into quota diagnostics", () => {
  const error = memoryFailureDiagnostic(429, {
    reason_code: "unexpected_provider_text",
    error: "secret token and private payload"
  }, "/v1/quota/reserve?private=query");
  assert.equal(error.name, "EVEQuotaReservationError");
  assert.equal(error.reason_code, "unclassified");
  assert.match(error.message, /reason_code=unclassified/);
  assert.doesNotMatch(error.message, /secret|private|unexpected_provider_text|query/);
});

test("non-quota memory failures are categorized without exposing request paths", () => {
  const error = memoryFailureDiagnostic(500, { error: "sensitive" }, "/v1/recall?q=private");
  assert.equal(error.name, "PersistentMemoryHttpError");
  assert.equal(error.category, "memory");
  assert.doesNotMatch(error.message, /private|sensitive|recall/);
});
