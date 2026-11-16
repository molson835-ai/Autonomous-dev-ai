import test from "node:test";
import assert from "node:assert/strict";
import {
  EARNED_GROWTH_CAPABILITIES,
  evaluateExpenseApproval,
  evaluateHardwarePurchaseApproval,
  evaluateSkillResourceAction,
  validateRevenueRecord,
  validateServiceExperiment,
  validateSkillEvidence,
} from "../agent/lib/earned-growth-policy.mjs";

const approvalFor = (overrides = {}) => ({
  status: "approved", reference: "approval-001",
  item: "Research hardware", seller: "Example seller",
  purpose: "Remove measured bottleneck", totalCost: 80, spendingCap: 100,
  expiresAt: "2027-01-01T00:00:00.000Z", ...overrides,
});

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

test("verified receipts require positive amount, currency, and evidence but remain net-of-reserves", () => {
  assert.equal(validateRevenueRecord({
    status: "received_verified", amount: 0, currency: "USD", evidenceReference: "receipt-1",
  }).valid, false);
  assert.equal(validateRevenueRecord({
    status: "received_verified", amount: 25, currency: "USD",
  }).valid, false);
  const result = validateRevenueRecord({
    status: "received_verified", amount: 25, currency: "USD", evidenceReference: "verified-receipt-1",
  });
  assert.equal(result.valid, true);
  assert.equal(result.spendable, false);
  assert.equal(result.verifiedReceipt, true);
});

test("expenses require a current owner approval record matching the exact expense", () => {
  const base = {
    item: "Research hardware", seller: "Example seller", purpose: "Remove measured bottleneck",
    totalCost: 80, spendingCap: 100, fundsStatus: "cleared_business_revenue",
    availableClearedFunds: 100, approval: approvalFor(), nowMs: Date.parse("2026-11-15T00:00:00Z"),
  };
  assert.equal(evaluateExpenseApproval({ ...base, approval: undefined }).allowed, false);
  assert.equal(evaluateExpenseApproval({ ...base, approval: approvalFor({ status: "pending" }) }).allowed, false);
  assert.equal(evaluateExpenseApproval({ ...base, approval: approvalFor({ item: "Different item" }) }).allowed, false);
  assert.equal(evaluateExpenseApproval({ ...base, approval: approvalFor({ totalCost: 79 }) }).allowed, false);
  assert.equal(evaluateExpenseApproval({ ...base, approval: approvalFor({ spendingCap: 90 }) }).allowed, false);
  assert.equal(evaluateExpenseApproval({ ...base, approval: approvalFor({ expiresAt: "2026-11-14T23:59:59Z" }) }).allowed, false);
  assert.equal(evaluateExpenseApproval({ ...base, fundsStatus: "pending_payment" }).allowed, false);
  assert.equal(evaluateExpenseApproval({ ...base, availableClearedFunds: 79 }).allowed, false);
  assert.equal(evaluateExpenseApproval({ ...base, totalCost: 110 }).allowed, false);
  assert.equal(evaluateExpenseApproval({ ...base, ownerFundsUsed: true }).allowed, false);
  assert.equal(evaluateExpenseApproval({ ...base, personalPaymentMethod: true }).allowed, false);
  assert.equal(evaluateExpenseApproval(base).allowed, true);
});

test("hardware expenses require exact owner approval, net cleared business funds, and destination", () => {
  const base = {
    item: "Research hardware", seller: "Example seller", purpose: "Remove measured bottleneck",
    shippingDestination: "Owner-confirmed destination", totalLandedCost: 80, spendingCap: 100,
    fundsStatus: "cleared_business_revenue", clearedBusinessFunds: 100,
    approval: approvalFor(), nowMs: Date.parse("2026-11-15T00:00:00Z"),
  };
  assert.equal(evaluateHardwarePurchaseApproval({ ...base, approval: undefined }).allowed, false);
  assert.equal(evaluateHardwarePurchaseApproval({ ...base, totalLandedCost: 110 }).allowed, false);
  assert.equal(evaluateHardwarePurchaseApproval({ ...base, shippingDestination: "" }).allowed, false);
  assert.equal(evaluateHardwarePurchaseApproval(base).allowed, true);
});

test("skill growth is autonomous while customer contact and publishing remain owner-approved", () => {
  assert.equal(EARNED_GROWTH_CAPABILITIES.mayDiscoverSkills, true);
  assert.equal(EARNED_GROWTH_CAPABILITIES.mayAcquireNoCostSkillResources, true);
  assert.equal(EARNED_GROWTH_CAPABILITIES.mayInspectAndPracticeSkills, true);
  assert.equal(EARNED_GROWTH_CAPABILITIES.mayIntegrateReviewedSkillsWithinExistingPermissions, true);
  assert.equal(EARNED_GROWTH_CAPABILITIES.mayPrepareOutreachDrafts, true);
  assert.equal(EARNED_GROWTH_CAPABILITIES.mayContactCustomers, false);
  assert.equal(EARNED_GROWTH_CAPABILITIES.mayPublishOffers, false);
  assert.equal(EARNED_GROWTH_CAPABILITIES.mayAcceptPayments, false);
  assert.equal(EARNED_GROWTH_CAPABILITIES.mayAccessFinancialAccounts, false);
  assert.equal(EARNED_GROWTH_CAPABILITIES.mayPurchase, false);
  assert.equal(EARNED_GROWTH_CAPABILITIES.mayDeployProduction, false);
});

test("Eve may autonomously discover, retrieve, and inspect no-cost skill resources", () => {
  for (const action of ["discover", "retrieve", "inspect"]) {
    assert.deepEqual(evaluateSkillResourceAction({ action, noCost: true }), {
      allowed: true,
      requiresOwnerApproval: false,
      reason: "Within the existing skill-growth delegation and permission scope.",
    });
  }
});

test("practice and sandbox tests require isolation", () => {
  assert.equal(evaluateSkillResourceAction({ action: "practice", noCost: true }).requiresOwnerApproval, true);
  assert.equal(evaluateSkillResourceAction({ action: "practice", noCost: true, isolated: true }).allowed, true);
  assert.equal(evaluateSkillResourceAction({ action: "sandbox_test", noCost: true, isolated: true }).allowed, true);
});

test("reviewed skill integration is allowed only within existing permissions", () => {
  assert.equal(evaluateSkillResourceAction({
    action: "integrate", noCost: true, reviewed: true, existingPermissionsOnly: true,
  }).allowed, true);
  assert.equal(evaluateSkillResourceAction({
    action: "integrate", noCost: true, reviewed: true, existingPermissionsOnly: false,
  }).requiresOwnerApproval, true);
});

test("possible conflicts, behavior changes, sensitive access, external effects, and costs require owner approval", () => {
  for (const flag of [
    "conflictsWithExistingRules", "changesEstablishedBehavior", "expandsPermissions",
    "accessesSensitiveData", "externalSideEffects", "incursCost", "accessesSecrets",
    "productionChanges", "executesUntrustedCodeOutsideSandbox", "unknownRisk",
  ]) {
    const result = evaluateSkillResourceAction({ action: "inspect", noCost: true, [flag]: true });
    assert.equal(result.allowed, false, flag);
    assert.equal(result.requiresOwnerApproval, true, flag);
  }
  assert.equal(evaluateSkillResourceAction({ action: "retrieve", noCost: false }).requiresOwnerApproval, true);
  assert.equal(evaluateSkillResourceAction({ action: "enable_tool", noCost: true }).requiresOwnerApproval, true);
  assert.equal(evaluateSkillResourceAction({ action: "grant_permission", noCost: true }).requiresOwnerApproval, true);
  assert.equal(evaluateSkillResourceAction({ action: "unknown", noCost: true }).requiresOwnerApproval, true);
});
