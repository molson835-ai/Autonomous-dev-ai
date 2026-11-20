const PROVIDERS = new Set(["vercel", "cloudflare"]);
const PROFILES = new Set(["node-test-pure-js", "bounded-analysis"]);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_APPROVAL_LIFETIME_MS = 24 * 60 * 60 * 1000;

/**
 * Validate a server-issued, owner-authenticated, task-specific activation approval.
 * This prepares an auditable authorization envelope only; no provider can be activated.
 *
 * The approval record MUST come from trusted owner-authenticated storage. A caller-
 * supplied object is not proof of owner identity or approval.
 */
export function prepareTaskActivationEnvelope(input, { now = new Date().toISOString() } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some((key) => !["taskPreflight", "approval"].includes(key))) {
    return blocked("Task preflight and trusted owner approval are required.");
  }

  const { taskPreflight, approval } = input;
  if (!taskPreflight || typeof taskPreflight !== "object" ||
      taskPreflight.valid !== true ||
      taskPreflight.status !== "task_preflight_passed_not_executed" ||
      taskPreflight.activationAllowed !== false ||
      taskPreflight.executionAllowed !== false) {
    return blocked("A successful non-executing task preflight is required.");
  }

  if (!approval || typeof approval !== "object" || Array.isArray(approval) ||
      Object.keys(approval).some((key) => ![
        "approvalId", "taskId", "provider", "profile", "timeoutMs",
        "status", "approvedBy", "approvedAt", "expiresAt"
      ].includes(key))) {
    return blocked("Approval record schema is invalid.");
  }

  if (typeof approval.approvalId !== "string" || !ID.test(approval.approvalId) ||
      typeof approval.taskId !== "string" || !ID.test(approval.taskId) ||
      !PROVIDERS.has(approval.provider) || !PROFILES.has(approval.profile) ||
      !Number.isInteger(approval.timeoutMs) || approval.timeoutMs < 1 || approval.timeoutMs > 60_000 ||
      approval.status !== "approved" || approval.approvedBy !== "owner" ||
      !validIso(approval.approvedAt) || !validIso(approval.expiresAt) || !validIso(now)) {
    return blocked("Approval record is incomplete or invalid.");
  }

  const approvedAt = Date.parse(approval.approvedAt);
  const expiresAt = Date.parse(approval.expiresAt);
  const current = Date.parse(now);
  if (expiresAt <= approvedAt || expiresAt - approvedAt > MAX_APPROVAL_LIFETIME_MS ||
      current < approvedAt || current >= expiresAt) {
    return blocked("Owner approval is expired, not yet active, or exceeds the 24-hour validity limit.");
  }

  if (approval.taskId !== taskPreflight.taskId ||
      approval.provider !== taskPreflight.provider ||
      approval.profile !== taskPreflight.profile ||
      approval.timeoutMs !== taskPreflight.timeoutMs) {
    return blocked("Owner approval does not exactly match the task and bounded preflight.");
  }

  return {
    valid: true,
    status: "owner_approved_prepared_not_activated",
    taskId: taskPreflight.taskId,
    provider: taskPreflight.provider,
    profile: taskPreflight.profile,
    timeoutMs: taskPreflight.timeoutMs,
    approvalId: approval.approvalId,
    approvedAt: approval.approvedAt,
    expiresAt: approval.expiresAt,
    auditEvent: {
      type: "provider_activation_approval_validated",
      taskId: taskPreflight.taskId,
      approvalId: approval.approvalId,
      provider: taskPreflight.provider,
      profile: taskPreflight.profile,
      timeoutMs: taskPreflight.timeoutMs,
      occurredAt: now,
      outcome: "approved_but_not_activated",
    },
    activationAllowed: false,
    executionAllowed: false,
    nextStep: "separate_provider_activation_implementation_and_review",
  };
}

function validIso(value) {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function blocked(reason) {
  return {
    valid: false,
    status: "blocked",
    reason,
    activationAllowed: false,
    executionAllowed: false,
  };
}
