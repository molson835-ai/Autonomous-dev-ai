import { createExecutionPlan } from "./provider-runtime-policy.mjs";
import { evaluateProviderReadiness } from "./provider-readiness-policy.mjs";
import { evaluateExecutionUsage } from "./execution-usage-policy.mjs";

const ALLOWED_KEYS = new Set(["request", "readiness", "usage"]);

/**
 * Join the independent provider, readiness, and usage policies into one
 * deterministic preflight. A successful result is still not permission to
 * create a sandbox or execute code.
 */
export function evaluateProviderExecutionPreflight(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return blocked("A preflight input object is required.");
  }
  if (Object.keys(input).some((key) => !ALLOWED_KEYS.has(key))) {
    return blocked("Unsupported preflight property.");
  }
  const { request, readiness, usage } = input;
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return blocked("An execution request is required.");
  }
  const plan = createExecutionPlan(request);
  if (!plan.valid) return blocked(`Execution plan rejected: ${plan.reason}`);

  const readinessResult = evaluateProviderReadiness(readiness);
  if (readinessResult.status !== "ready_for_separate_activation_review" ||
      readinessResult.provider !== plan.provider ||
      readinessResult.activationAllowed !== false) {
    return blocked("Provider readiness is incomplete or does not match the requested provider.", {
      readiness: readinessResult,
    });
  }

  const usageResult = evaluateExecutionUsage(usage);
  if (!usageResult.valid || usageResult.provider !== plan.provider ||
      usageResult.action === "stop_optional" || usageResult.action === "stop_all") {
    return blocked("Verified usage is missing, invalid, mismatched, or over the execution threshold.", {
      usage: usageResult,
    });
  }

  return {
    valid: true,
    status: "preflight_passed_not_executed",
    provider: plan.provider,
    profile: plan.profile,
    timeoutMs: plan.timeoutMs,
    usageAction: usageResult.action,
    readinessStatus: readinessResult.status,
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
