const DEFAULT_LIMITS = Object.freeze({
  maxStepsPerTurn: 8,
  maxToolCallsPerTurn: 12,
  maxOutputCharsPerTurn: 12000,
  maxTokensPerTurn: 10000,
  maxTurnDurationMs: 45 * 1000,
  maxRetries: 3,
  maxConsecutiveFailures: 3,
  maxTaskAgeMs: 24 * 60 * 60 * 1000,
  baseRetryDelayMs: 60 * 1000,
  maxRetryDelayMs: 15 * 60 * 1000
});

const QUOTA_TERMS = /quota exceeded|insufficient quota|usage limit|billing limit|resource exhausted|credits exhausted/i;
const RATE_LIMIT_TERMS = /rate.?limit|too many requests|throttl/i;
const TRANSIENT_TERMS = /timeout|timed out|temporar|network|connection reset|fetch failed|service unavailable/i;

function finiteNonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function resolveResourceLimits(overrides = {}) {
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  for (const [key, value] of Object.entries(limits)) {
    if (!finiteNonNegative(value) || (key !== "maxTaskAgeMs" && value === 0)) {
      throw new TypeError(`Invalid resource limit: ${key}`);
    }
  }
  return Object.freeze(limits);
}

/** Classify provider/runtime failures without exposing raw error text to logs. */
export function classifyResourceFailure(error) {
  const message = typeof error === "string" ? error
    : [error?.code, error?.message, error?.name].filter(Boolean).join(" ");
  const status = Number(error?.status ?? error?.statusCode ?? 0);
  if (status === 402 || QUOTA_TERMS.test(message)) return "quota_exhausted";
  if (RATE_LIMIT_TERMS.test(message) || status === 429) return "rate_limited";
  if (status === 408 || status >= 500 || TRANSIENT_TERMS.test(message)) return "transient";
  if (status === 401 || status === 403) return "authorization";
  if (status >= 400) return "permanent";
  return "unknown";
}

export function retryDelayMs(attempt, limits = DEFAULT_LIMITS) {
  const resolved = resolveResourceLimits(limits);
  if (!Number.isInteger(attempt) || attempt < 1) throw new TypeError("Retry attempt must be a positive integer");
  const exponent = Math.min(attempt - 1, 30);
  return Math.min(resolved.baseRetryDelayMs * (2 ** exponent), resolved.maxRetryDelayMs);
}

/**
 * Pure continuation gate. It never performs a retry, schedule, provider switch,
 * payment, or external action; callers must persist the returned decision.
 */
export function evaluateResourceBudget({
  task = {},
  usage = {},
  error = null,
  now = Date.now(),
  limits: limitOverrides = {},
  emergencyStop = false
} = {}) {
  const limits = resolveResourceLimits(limitOverrides);
  const status = task.status ?? "running";
  if (["succeeded", "failed", "cancelled"].includes(status)) {
    return { action: "stop", status, reason: "task_terminal" };
  }
  if (emergencyStop || task.ownerPaused === true || status === "paused") {
    return { action: "pause", status: "paused", reason: emergencyStop ? "emergency_stop" : "owner_pause" };
  }

  const failure = error ? classifyResourceFailure(error) : null;
  if (usage.quotaExceeded === true || failure === "quota_exhausted") {
    return { action: "pause", status: "paused", reason: "quota_exhausted", providerFallbackAllowed: false };
  }
  if (failure === "authorization" || failure === "permanent") {
    return { action: "stop", status: "failed", reason: failure };
  }

  const createdAt = Date.parse(task.createdAt ?? task.created_at ?? "");
  if (Number.isFinite(createdAt) && now - createdAt > limits.maxTaskAgeMs) {
    return { action: "stop", status: "failed", reason: "task_age_limit" };
  }
  const retries = task.retryCount ?? task.attempt_count ?? 0;
  const consecutiveFailures = task.consecutiveFailures ?? 0;
  if (failure && ["transient", "rate_limited", "unknown"].includes(failure)) {
    if (retries >= limits.maxRetries || consecutiveFailures >= limits.maxConsecutiveFailures) {
      return { action: "stop", status: "failed", reason: "retry_budget_exhausted", failure };
    }
    return {
      action: "yield",
      status: "waiting",
      reason: failure,
      retryAfterMs: retryDelayMs(retries + 1, limits)
    };
  }

  const checks = [
    ["steps", usage.steps ?? usage.stepCount, limits.maxStepsPerTurn],
    ["tool_calls", usage.toolCalls ?? usage.toolCallCount, limits.maxToolCallsPerTurn],
    ["output_chars", usage.outputChars, limits.maxOutputCharsPerTurn],
    ["tokens", usage.tokens ?? usage.totalTokens, limits.maxTokensPerTurn],
    ["elapsed_ms", usage.elapsedMs, limits.maxTurnDurationMs]
  ];
  for (const [name, value, cap] of checks) {
    if (!finiteNonNegative(value)) {
      return { action: "stop", status: "failed", reason: "invalid_usage_measurement", measurement: name };
    }
    if (value >= cap) {
      return { action: "yield", status: "waiting", reason: `${name}_budget_reached`, checkpointRequired: true };
    }
  }
  return { action: "continue", status: "running", reason: "within_budget" };
}

export const RESOURCE_BUDGET_DEFAULTS = DEFAULT_LIMITS;
