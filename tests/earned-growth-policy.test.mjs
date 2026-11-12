import test from "node:test";
import assert from "node:assert/strict";
import {
  EARNED_GROWTH_CAPABILITIES,
  evaluateHardwarePurchaseApproval,
  validateRevenueRecord,
  validateServiceExperiment,
  validateSkillEvidence,
} from "../agent/lib/earned-growth-policy.mjs";

test("demonstrated skills require reproducible evaluation evidence", () => {
  assert.equal(validateSkillEvidence({ skill: "research", status: "practiced" }).valid, true);
  assert.equal(validateSkillEvidence({ skill: "research", status: "demonstrated" }).valid, false);
  assert.equal(validateSkillEvidence({
    skill: "research", status: "demonstrated",
    evaluationReference: "eval-001", observedResult: "Passed source verification rubric",
  }).valid, true);
});

test("successful service experiments require evidence", () => {
  assert.equal(validateServiceExperiment({
    id: "pilot-001", problemHypothesis: "Local shops need clearer listings",
    deliverable: "Listing audit", outcome: "success",
  }).valid, false);
  assert.equal(validateServiceExperiment({
    id: "pilot-001", problemHypothesis: "Local shops need clearer listings",
    deliverable: "Listing audit", outcome: "success", evidenceReference: "review-001",
  }).valid, true);
  assert.equal(validateServiceExperiment({
    id: "pilot-002", problemHypothesis: "Test", deliverable: "Sample", outcome: "failure",
  }).valid, true);
});

test("quotes and pending payments are never spendable revenue", () => {
  for (const status of ["proposed", "quoted", "pending"]) {
    const result = validateRevenueRecord({ status });
    assert.equal(result.valid, true);
    assert.equal(result.spendable, false);
  }
});

test("verified receipts require positive amount, currency, and evidence", () => {
  assert.equal(validateRevenueRecord({
    status: "received_verified", amount: 0, currency: "USD", evidenceReference: "receipt-1",
  }).valid, false);
  assert.equal(validateRevenueRecord({
    status: "received_verified", amount: 25, currency: "USD",
  }).valid, false);
  const result = validateRevenueRecord({
    status: "received_verified", amount: 25, currency: "USD", evidenceReference: "owner-verified-receipt-1",
  });
  assert.equal(result.valid, true);
  assert.equal(result.spendable, false);
});

test("hardware purchase recommendation requires exact owner approval and cleared business funds", () => {
  const base = {
    item: "RAM upgrade", seller: "Example seller", purpose: "Remove measured memory bottleneck",
    shippingDestination: "Owner-approved destination", totalLandedCost: 80, spendingCap: 100,
    fundsStatus: "cleared_business_revenue", clearedBusinessFunds: 100,
    ownerApproved: true, approvalReference: "approval-001",
  };
  assert.equal(evaluateHardwarePurchaseApproval({ ...base, ownerApproved: false }).allowed, false);
  assert.equal(evaluateHardwarePurchaseApproval({ ...base, fundsStatus: "pending_payment" }).allowed, false);
  assert.equal(evaluateHardwarePurchaseApproval({ ...base, totalLandedCost: 110 }).allowed, false);
  const result = evaluateHardwarePurchaseApproval(base);
  assert.equal(result.allowed, true);
  assert.equal(result.action, "recommendation_only");
  assert.equal(result.requiresSeparateExecutionApproval, true);
});

test("external financial and customer actions remain disabled", () => {
  assert.equal(EARNED_GROWTH_CAPABILITIES.mayContactCustomers, false);
  assert.equal(EARNED_GROWTH_CAPABILITIES.mayPublishOffers, false);
  assert.equal(EARNED_GROWTH_CAPABILITIES.mayAcceptPayments, false);
  assert.equal(EARNED_GROWTH_CAPABILITIES.mayAccessFinancialAccounts, false);
  assert.equal(EARNED_GROWTH_CAPABILITIES.mayPurchase, false);
  assert.equal(EARNED_GROWTH_CAPABILITIES.mayDeployProduction, false);
});
