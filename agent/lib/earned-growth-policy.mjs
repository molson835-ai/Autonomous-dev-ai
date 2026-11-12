const REVENUE_STATES = new Set(["proposed", "quoted", "pending", "received_verified"]);
const SKILL_STATES = new Set(["untested", "practiced", "demonstrated"]);
const EXPERIMENT_OUTCOMES = new Set(["not_started", "in_progress", "success", "failure", "partial"]);

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateSkillEvidence(record) {
  if (!record || !nonEmpty(record.skill) || !SKILL_STATES.has(record.status)) {
    return { valid: false, reason: "Skill and a recognized status are required." };
  }
  if (record.status === "demonstrated" && (!nonEmpty(record.evaluationReference) || !nonEmpty(record.observedResult))) {
    return { valid: false, reason: "Demonstrated skills require an evaluation reference and observed result." };
  }
  return { valid: true };
}

export function validateServiceExperiment(record) {
  if (!record || !nonEmpty(record.id) || !nonEmpty(record.problemHypothesis) || !nonEmpty(record.deliverable) || !EXPERIMENT_OUTCOMES.has(record.outcome)) {
    return { valid: false, reason: "Experiment ID, problem hypothesis, deliverable, and recognized outcome are required." };
  }
  if (record.outcome === "success" && !nonEmpty(record.evidenceReference)) {
    return { valid: false, reason: "Successful experiments require an evidence reference." };
  }
  return { valid: true };
}

export function validateRevenueRecord(record) {
  if (!record || !REVENUE_STATES.has(record.status)) {
    return { valid: false, reason: "A recognized revenue state is required." };
  }
  if (record.status !== "received_verified") {
    return { valid: true, spendable: false };
  }
  if (!(typeof record.amount === "number" && Number.isFinite(record.amount) && record.amount > 0) ||
      !nonEmpty(record.currency) || !nonEmpty(record.evidenceReference)) {
    return { valid: false, reason: "Verified receipts require a positive amount, currency, and evidence reference." };
  }
  return { valid: true, spendable: false, verifiedReceipt: true };
}

export function evaluateHardwarePurchaseApproval(request) {
  const required = [
    "item", "seller", "purpose", "shippingDestination", "approvalReference",
  ];
  if (!request || required.some((key) => !nonEmpty(request[key]))) {
    return { allowed: false, reason: "Specific owner approval, item, seller, purpose, and shipping destination are required." };
  }
  if (!(typeof request.totalLandedCost === "number" && Number.isFinite(request.totalLandedCost) && request.totalLandedCost > 0) ||
      !(typeof request.spendingCap === "number" && Number.isFinite(request.spendingCap) && request.spendingCap > 0) ||
      request.totalLandedCost > request.spendingCap) {
    return { allowed: false, reason: "A valid total landed cost within the explicit spending cap is required." };
  }
  if (request.fundsStatus !== "cleared_business_revenue" ||
      !(typeof request.clearedBusinessFunds === "number" && request.clearedBusinessFunds >= request.totalLandedCost)) {
    return { allowed: false, reason: "Only sufficient cleared business revenue may fund a purchase." };
  }
  if (request.ownerApproved !== true) {
    return { allowed: false, reason: "The owner has not explicitly approved this exact purchase." };
  }
  return { allowed: true, action: "recommendation_only", requiresSeparateExecutionApproval: true };
}

export const EARNED_GROWTH_CAPABILITIES = Object.freeze({
  mayResearch: true,
  mayPrepareDrafts: true,
  mayRecordExperiments: true,
  mayRecordVerifiedRevenueEvidence: true,
  mayContactCustomers: false,
  mayPublishOffers: false,
  mayAcceptPayments: false,
  mayAccessFinancialAccounts: false,
  mayPurchase: false,
  mayDeployProduction: false,
});
