const DEFAULT_LIMITS = Object.freeze({
  maxStepsPerTurn: 4,
  maxToolCallsPerTurn: 6,
  maxOutputCharsPerTurn: 6000,
  maxTokensPerTurn: 4000,
  maxTurnDurationMs: 30 * 1000,
  maxRetries: 1,
  maxConsecutiveFailures: 2,
  maxTaskAgeMs: 24 * 60 * 60 * 1000,
  baseRetryDelayMs: 60 * 1000,
  maxRetryDelayMs: 15 * 60 * 1000,
  dailyNeuronBudget: 7000,
  dailyNeuronReserve: 3000,
  maxQuotaObservationAgeMs: 15 * 60 * 1000
});

const QUOTA_TERMS = /quota exceeded|insufficient quota|usage limit|billing limit|resource exhausted|credits exhausted|daily free allocation|neurons? (?:allocation|limit|quota|exhausted)/i;
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
  if (limits.dailyNeuronReserve >= limits.dailyNeuronBudget) {
    throw new TypeError("Daily neuron reserve must be smaller than the daily budget");
  }
  return Object.freeze(limits);
}

/** Classify provider/runtime failures without exposing raw error text to logs. */
export function classifyResourceFailure(error) {
  const message = typeof error === "string" ? error
    : [error?.code, error?.message, error?.name, error?.cause?.code, error?.cause?.message].filter(Boolean).join(" ");
  const status = Number(error?.status ?? error?.statusCode ?? error?.cause?.status ?? 0);
  const code = String(error?.code ?? error?.cause?.code ?? "");
  // Cloudflare Workers AI uses error code 4006 for exhausted daily free neurons.
  // Check this before generic HTTP 429 handling: it is not a transient rate limit.
  if (code === "4006" || /\b4006\b/.test(message) || QUOTA_TERMS.test(message) || status === 402) {
    return "quota_exhausted";
  }
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
 * Account-wide daily quota gate. Only an authoritative, fresh observation may
 * authorize model work. Local token estimates are not Cloudflare neuron counts.
 */
export function evaluateDailyNeuronBudget({
  usedNeurons,
  observedAt,
  sourceVerified = false,
  now = Date.now(),
  limits: limitOverrides = {}
} = {}) {
  const limits = resolveResourceLimits(limitOverrides);
  const observed = Date.parse(observedAt ?? "");
  if (!sourceVerified || !finiteNonNegative(usedNeurons) || !Number.isFinite(observed)) {
    return { action: "pause", status: "paused", reason: "daily_quota_usage_unknown", allowModelCalls: false };
  }
  if (!Number.isFinite(now) || now - observed < 0 || now - observed > limits.maxQuotaObservationAgeMs) {
    return { action: "pause", status: "paused", reason: "daily_quota_observation_stale", allowModelCalls: false };
  }
  if (usedNeurons >= limits.dailyNeuronBudget) {
    return { action: "pause", status: "paused", reason: "daily_neuron_budget_reached", allowModelCalls: false, usedNeurons };
  }
  const target = limits.dailyNeuronBudget;
  const level = usedNeurons >= target * 0.85 ? "critical"
    : usedNeurons >= target * 0.70 ? "high"
      : usedNeurons >= target * 0.50 ? "restricted" : "normal";
  return {
    action: "continue",
    status: level,
    reason: "within_daily_neuron_budget",
    allowModelCalls: true,
    usedNeurons,
    remainingBudget: target - usedNeurons,
    reservedNeurons: limits.dailyNeuronReserve
  };
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
    return { action: "pause", status: "paused", reason: "quota_exhausted", providerFallbackAllowed: false, retryAllowed: false };
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
