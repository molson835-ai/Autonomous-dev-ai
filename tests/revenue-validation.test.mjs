import test from "node:test";
import assert from "node:assert/strict";
import { assessRevenueExperiment, validateRevenueEvidence } from "../agent/lib/revenue-validation.mjs";

const at = "2026-11-25T12:00:00Z";

test("public problem signals never become buyer validation or revenue", () => {
  const result = assessRevenueExperiment({
    evidence: [{ id: "p1", type: "public_problem_signal", statement: "Inventory discrepancies are costly", sourceUrl: "https://example.com/report", observedAt: at }],
  });
  assert.equal(result.valid, true);
  assert.equal(result.status, "problem_signals_only");
  assert.equal(result.verifiedPayments.length, 0);
  assert.equal(result.revenueForecast, null);
});

test("direct buyer confirmation is distinct from willingness to pay", () => {
  const result = assessRevenueExperiment({
    evidence: [
      { id: "b1", type: "direct_buyer_problem_confirmation", statement: "Buyer described recurring count variance", observedAt: at },
    ],
  });
  assert.equal(result.status, "buyer_problem_confirmed");
  assert.equal(result.evidenceCounts.statedWillingnessToPay, 0);
});


test("stated willingness to pay remains separate from a transaction", () => {
  const result = assessRevenueExperiment({
    evidence: [{ id: "w1", type: "stated_willingness_to_pay", statement: "Buyer said they would consider paying $20", observedAt: at }],
  });
  assert.equal(result.status, "willingness_to_pay_stated");
  assert.equal(result.verifiedPayments.length, 0);
});

test("completed user test is recorded without implying payment", () => {
  const result = assessRevenueExperiment({
    evidence: [{ id: "t1", type: "completed_user_test", statement: "User completed count workflow", observedAt: at }],
  });
  assert.equal(result.status, "user_test_completed");
  assert.equal(result.verifiedPayments.length, 0);
});

test("payment requires independent verification, positive amount, currency, and reference", () => {
  const invalid = validateRevenueEvidence([
    { id: "pay1", type: "verified_payment", statement: "Paid", observedAt: at, amount: 10, currency: "USD", independentlyVerified: false, verificationRef: "receipt-1" },
  ]);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.includes("evidence_0_payment_not_independently_verified"));

  const valid = assessRevenueExperiment({
    evidence: [{
      id: "pay2", type: "verified_payment", statement: "Payment cleared", observedAt: at,
      amount: 10, currency: "USD", independentlyVerified: true, verificationRef: "owner-verified-record-1",
    }],
  });
  assert.equal(valid.status, "verified_payment_recorded");
  assert.deepEqual(valid.verifiedPayments.map(item => item.amount), [10]);
});

test("rejects duplicate IDs, unsafe source URLs, and invalid timestamps", () => {
  const result = validateRevenueEvidence([
    { id: "x", type: "public_problem_signal", statement: "Signal", sourceUrl: "http://example.com", observedAt: at },
    { id: "x", type: "competitor_signal", statement: "Competitor", sourceUrl: "https://example.com", observedAt: "yesterday" },
  ]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("evidence_1_invalid_or_duplicate_id"));
  assert.ok(result.errors.includes("evidence_0_requires_https_source"));
  assert.ok(result.errors.includes("evidence_1_invalid_observed_at"));
});

test("bounds evidence arrays and rejects unknown evidence types", () => {
  assert.ok(validateRevenueEvidence(Array(101).fill({})).errors.includes("evidence_limit_exceeded"));
  assert.ok(validateRevenueEvidence([{ id: "u", type: "forecast", statement: "x", observedAt: at }]).errors.includes("evidence_0_invalid_type"));
});
