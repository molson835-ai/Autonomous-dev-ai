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
  return { valid: true, spendable: false, verifiedReceipt: true, reason: "Receipt verified; reserves and liabilities must be deducted before calculating available funds." };
}

/**
 * Fail-closed authorization for any business expense. This is a policy
 * decision helper only; it does not execute payments or purchase anything.
 */
export function evaluateExpenseApproval(request) {
  const required = ["item", "seller", "purpose", "approvalReference"];
  if (!request || required.some((key) => !nonEmpty(request[key]))) {
    return { allowed: false, reason: "Exact item, payee, purpose, and owner approval reference are required." };
  }
  if (!(typeof request.totalCost === "number" && Number.isFinite(request.totalCost) && request.totalCost > 0) ||
      !(typeof request.spendingCap === "number" && Number.isFinite(request.spendingCap) && request.spendingCap > 0) ||
      request.totalCost > request.spendingCap) {
    return { allowed: false, reason: "Total cost must be positive and within the explicitly approved spending cap." };
  }
  if (request.fundsStatus !== "cleared_business_revenue" ||
      !(typeof request.availableClearedFunds === "number" && Number.isFinite(request.availableClearedFunds) && request.availableClearedFunds >= request.totalCost)) {
    return { allowed: false, reason: "Only sufficient cleared EVE business revenue, net of reserves and liabilities, may fund an expense." };
  }
  if (request.ownerApproved !== true || !nonEmpty(request.approvalReference)) {
    return { allowed: false, reason: "Explicit approval for this exact expense is required." };
  }
  if (request.ownerFundsUsed === true || request.personalPaymentMethod === true) {
    return { allowed: false, reason: "Owner personal funds, credit, accounts, and payment methods are permanently prohibited." };
  }
  return { allowed: true, action: "authorized_exact_expense", amount: request.totalCost, approvalReference: request.approvalReference };
}

export function evaluateHardwarePurchaseApproval(request) {
  if (!request || !nonEmpty(request.shippingDestination)) {
    return { allowed: false, reason: "A confirmed shipping destination is required for hardware." };
  }
  const result = evaluateExpenseApproval({
    item: request.item,
    seller: request.seller,
    purpose: request.purpose,
    totalCost: request.totalLandedCost,
    spendingCap: request.spendingCap,
    fundsStatus: request.fundsStatus,
    availableClearedFunds: request.clearedBusinessFunds,
    ownerApproved: request.ownerApproved,
    approvalReference: request.approvalReference,
    ownerFundsUsed: request.ownerFundsUsed,
    personalPaymentMethod: request.personalPaymentMethod,
  });
  if (!result.allowed) return result;
  return { ...result, action: "authorized_exact_hardware_expense", shippingDestination: request.shippingDestination };
}

export const EARNED_GROWTH_CAPABILITIES = Object.freeze({
  mayResearch: true,
  mayPrepareDrafts: true,
  mayRecordExperiments: true,
  mayRecordVerifiedRevenueEvidence: true,
  // Delegated business activity: only truthful, relevant, lawful and compliant.
  mayContactCustomers: true,
  mayPublishOffers: true,
  // Payment acceptance remains disabled until a no-user-liability payment path
  // and its fees, account ownership, and refund handling are independently verified.
  mayAcceptPayments: false,
  mayAccessFinancialAccounts: false,
  mayPurchase: false,
  mayDeployProduction: false,
});
