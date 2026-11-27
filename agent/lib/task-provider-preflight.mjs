import { validateTaskRecord, isTaskAuthorized } from "./task-lifecycle.mjs";
import { evaluateProviderExecutionPreflight } from "./provider-execution-preflight.mjs";

// Only owner-defined or exact approved-goal scopes with no external side effects may enter a provider preflight.
const PROVIDER_ELIGIBLE_SCOPES = new Set([
  "product_development",
  "testing",
  "documentation",
  "market_research",
  "ebay_inventory_audit_development",
]);

/**
 * Bind a provider preflight to one already-claimed, individually owner-approved or server-authorized goal task.
 * This is assessment only: it never claims, transitions, resumes, or executes a task.
 */
export function evaluateTaskProviderPreflight(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some((key) => !["task", "request", "readiness", "usage"].includes(key))) {
    return blocked("A task preflight input with only task, request, readiness, and usage is required.");
  }

  const { task, request, readiness, usage } = input;
  const validation = validateTaskRecord(task);
  if (!validation.valid) return blocked(`Task record rejected: ${validation.reason}`);

  if (task.status !== "running") {
    return blocked("Task must already be claimed and running before provider preflight.");
  }
  if (!isTaskAuthorized(task) || task.mission_authorized !== false) {
    return blocked("An individually owner-approved or server-authorized goal task is required; standing mission authorization is not accepted.");
  }
  if (!PROVIDER_ELIGIBLE_SCOPES.has(task.scope_id)) {
    return blocked("Task scope is not eligible for isolated provider execution.");
  }
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return blocked("A bounded provider execution request is required.");
  }

  const providerResult = evaluateProviderExecutionPreflight({ request, readiness, usage });
  if (providerResult.status !== "preflight_passed_not_executed" ||
      providerResult.activationAllowed !== false ||
      providerResult.executionAllowed !== false) {
    return blocked("Provider preflight did not pass.", { providerPreflight: providerResult });
  }

  return {
    valid: true,
    status: "task_preflight_passed_not_executed",
    taskId: task.id,
    taskScopeId: task.scope_id,
    provider: providerResult.provider,
    profile: providerResult.profile,
    timeoutMs: providerResult.timeoutMs,
    usageAction: providerResult.usageAction,
    activationAllowed: false,
    executionAllowed: false,
    nextStep: "separate_owner_activation_approval",
  };
}

function blocked(reason, details = {}) {
  return {
    valid: false,
    status: "blocked",
    reason,
    activationAllowed: false,
    executionAllowed: false,
    ...details,
  };
}
