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
 * Fail-closed authorization evaluator only. It does not execute payments.
 * A separate, trusted owner-control path must create the exact approval record.
 */
export function evaluateExpenseApproval(request) {
  const required = ["item", "seller", "purpose"];
  if (!request || required.some((key) => !nonEmpty(request[key]))) {
    return { allowed: false, reason: "Exact item, payee, and purpose are required." };
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
  const approval = request.approval;
  const nowMs = Number.isFinite(request.nowMs) ? request.nowMs : Date.now();
  if (!approval || approval.status !== "approved" ||
      !nonEmpty(approval.reference) ||
      approval.item !== request.item ||
      approval.seller !== request.seller ||
      approval.purpose !== request.purpose ||
      approval.totalCost !== request.totalCost ||
      approval.spendingCap !== request.spendingCap ||
      !Number.isFinite(Date.parse(approval.expiresAt)) ||
      Date.parse(approval.expiresAt) <= nowMs) {
    return { allowed: false, reason: "A current owner approval record matching this exact item, payee, purpose, total cost, and spending cap is required." };
  }
  if (request.ownerFundsUsed === true || request.personalPaymentMethod === true) {
    return { allowed: false, reason: "Owner personal funds, credit, accounts, and payment methods are permanently prohibited." };
  }
  return { allowed: true, action: "authorized_exact_expense", amount: request.totalCost, approvalReference: approval.reference };
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
    approval: request.approval,
    nowMs: request.nowMs,
    ownerFundsUsed: request.ownerFundsUsed,
    personalPaymentMethod: request.personalPaymentMethod,
  });
  if (!result.allowed) return result;
  return { ...result, action: "authorized_exact_hardware_expense", shippingDestination: request.shippingDestination };
}

const AUTONOMOUS_SKILL_ACTIONS = new Set(["discover", "retrieve", "inspect", "practice", "sandbox_test"]);
const REVIEWED_SKILL_ACTIONS = new Set(["integrate", "activate", "install_dependency"]);
const SKILL_ACTIONS = new Set([...AUTONOMOUS_SKILL_ACTIONS, ...REVIEWED_SKILL_ACTIONS, "enable_tool", "grant_permission"]);

const SKILL_CONFLICT_FLAGS = [
  "conflictsWithExistingRules",
  "changesEstablishedBehavior",
  "expandsPermissions",
  "accessesSensitiveData",
  "externalSideEffects",
  "incursCost",
  "accessesSecrets",
  "productionChanges",
  "executesUntrustedCodeOutsideSandbox",
  "unknownRisk",
];

/**
 * Evaluates whether a skill-resource step fits Eve's standing skill-growth
 * delegation. This is a policy decision helper, not an installer or executor.
 */
export function evaluateSkillResourceAction(request) {
  const action = request?.action;
  if (!SKILL_ACTIONS.has(action)) {
    return { allowed: false, requiresOwnerApproval: true, reason: "Unknown skill action; owner review is required." };
  }

  const conflicts = SKILL_CONFLICT_FLAGS.filter((flag) => request?.[flag] === true);
  if (conflicts.length > 0) {
    return {
      allowed: false,
      requiresOwnerApproval: true,
      reason: `Potential conflict or authority expansion: ${conflicts.join(", ")}.`,
    };
  }
  if (request?.noCost !== true) {
    return { allowed: false, requiresOwnerApproval: true, reason: "No-cost status is not verified." };
  }
  if (action === "enable_tool" || action === "grant_permission") {
    return { allowed: false, requiresOwnerApproval: true, reason: "Enabling tools or granting permissions requires owner approval." };
  }
  if (action === "practice" || action === "sandbox_test" || action === "install_dependency") {
    if (request?.isolated !== true) {
      return { allowed: false, requiresOwnerApproval: true, reason: "An isolated environment is required before practice, testing, or dependency installation." };
    }
  }
  if (REVIEWED_SKILL_ACTIONS.has(action)) {
    if (request?.reviewed !== true || request?.existingPermissionsOnly !== true) {
      return { allowed: false, requiresOwnerApproval: true, reason: "Integration requires a reviewed resource and confirmation that it uses only existing permissions." };
    }
  }
  return { allowed: true, requiresOwnerApproval: false, reason: "Within the existing skill-growth delegation and permission scope." };
}

export const EARNED_GROWTH_CAPABILITIES = Object.freeze({
  mayResearch: true,
  mayPrepareDrafts: true,
  mayRecordExperiments: true,
  mayRecordVerifiedRevenueEvidence: true,
  // Skill growth is delegated when no-cost, isolated where needed, and within existing permissions.
  mayDiscoverSkills: true,
  mayAcquireNoCostSkillResources: true,
  mayInspectAndPracticeSkills: true,
  mayIntegrateReviewedSkillsWithinExistingPermissions: true,
  // External customer activity remains owner-approved.
  mayPrepareOutreachDrafts: true,
  mayContactCustomers: false,
  mayPublishOffers: false,
  // Payment acceptance remains disabled until a no-user-liability payment path
  // and its fees, account ownership, and refund handling are independently verified.
  mayAcceptPayments: false,
  mayAccessFinancialAccounts: false,
  mayPurchase: false,
  mayDeployProduction: false,
});
