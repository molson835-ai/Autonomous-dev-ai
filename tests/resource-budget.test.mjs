import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyResourceFailure,
  evaluateDailyNeuronBudget,
  evaluateResourceBudget,
  resolveResourceLimits,
  retryDelayMs
} from "../agent/lib/resource-budget.mjs";

test("default limits are finite and bounded", () => {
  const limits = resolveResourceLimits();
  assert.equal(limits.maxStepsPerTurn, 4);
  assert.equal(limits.maxRetries, 1);
  assert.equal(limits.maxTurnDurationMs, 30_000);
  assert.equal(limits.maxTaskAgeMs, 24 * 60 * 60 * 1000);
  assert.equal(limits.dailyNeuronBudget, 7000);\n  assert.equal(limits.dailyNeuronReserve, 3000);
  assert.throws(() => resolveResourceLimits({ maxRetries: 0 }), /Invalid resource limit/);
});

test("quota exhaustion pauses and never switches to a paid fallback", () => {
  for (const error of [
    { status: 402, message: "payment required" },
    new Error("Insufficient quota for this request"),
    "provider usage limit reached"
  ]) {
    assert.deepEqual(evaluateResourceBudget({ task: { status: "running" }, error }), {
      action: "pause", status: "paused", reason: "quota_exhausted", providerFallbackAllowed: false
    });
  }
});

test("rate limits and transient errors yield with bounded exponential backoff", () => {
  assert.equal(classifyResourceFailure({ status: 429 }), "rate_limited");
  assert.equal(classifyResourceFailure({ status: 503 }), "transient");
  assert.equal(retryDelayMs(1), 60_000);
  assert.equal(retryDelayMs(2), 120_000);
  assert.equal(retryDelayMs(99), 15 * 60_000);
  const decision = evaluateResourceBudget({
    task: { status: "running", retryCount: 0, consecutiveFailures: 0 },
    error: { status: 429 }
  });
  assert.equal(decision.action, "yield");
  assert.equal(decision.retryAfterMs, 60_000);
});

test("retry exhaustion and permanent authorization failures stop safely", () => {
  assert.equal(evaluateResourceBudget({
    task: { retryCount: 3, consecutiveFailures: 3 }, error: new Error("network timeout")
  }).reason, "retry_budget_exhausted");
  assert.equal(evaluateResourceBudget({ error: { status: 403 } }).status, "failed");
});

test("per-turn step, tool, output, token, and duration caps checkpoint and yield", () => {
  const base = { steps: 1, toolCalls: 1, outputChars: 100, tokens: 100, elapsedMs: 1000 };
  const cases = [
    [{ ...base, steps: 4 }, "steps_budget_reached"],
    [{ ...base, toolCalls: 6 }, "tool_calls_budget_reached"],
    [{ ...base, outputChars: 6000 }, "output_chars_budget_reached"],
    [{ ...base, tokens: 4000 }, "tokens_budget_reached"],
    [{ ...base, elapsedMs: 30000 }, "elapsed_ms_budget_reached"]
  ];
  for (const [usage, reason] of cases) {
    const result = evaluateResourceBudget({ usage });
    assert.equal(result.action, "yield");
    assert.equal(result.reason, reason);
    assert.equal(result.checkpointRequired, true);
  }
});

test("owner pause, emergency stop, and terminal states prevent continuation", () => {
  assert.equal(evaluateResourceBudget({ task: { ownerPaused: true } }).action, "pause");
  assert.equal(evaluateResourceBudget({ emergencyStop: true }).reason, "emergency_stop");
  assert.equal(evaluateResourceBudget({ task: { status: "cancelled" } }).action, "stop");
});

test("task age and invalid measurements fail closed", () => {
  const now = Date.parse("2026-11-13T00:00:00.000Z");
  assert.equal(evaluateResourceBudget({
    task: { createdAt: "2026-11-11T00:00:00.000Z" }, now
  }).reason, "task_age_limit");
  assert.equal(evaluateResourceBudget({ usage: { tokens: -1 } }).reason, "invalid_usage_measurement");
});

test("missing usage measurements fail closed instead of assuming free capacity", () => {
  assert.deepEqual(evaluateResourceBudget({}), {
    action: "stop", status: "failed", reason: "invalid_usage_measurement", measurement: "steps"
  });
});

test("normal work inside all budgets may continue", () => {
  assert.deepEqual(evaluateResourceBudget({
    task: { status: "running" },
    usage: { steps: 2, toolCalls: 3, outputChars: 1500, tokens: 2200, elapsedMs: 8000 }
  }), { action: "continue", status: "running", reason: "within_budget" });
});

test("Cloudflare Workers AI daily-allocation error 4006 is quota exhaustion, not a retryable 429", () => {
  const failures = [
    { status: 429, code: 4006, message: "AiError: you have used up your daily free allocation of 10,000 neurons" },
    { status: 429, code: "4006", message: "daily free allocation exhausted" },
    { status: 429, message: "you have used up your daily free allocation of 10,000 neurons" }
  ];
  for (const error of failures) {
    assert.equal(classifyResourceFailure(error), "quota_exhausted");
    assert.deepEqual(evaluateResourceBudget({ task: { status: "running" }, error }), {
      action: "pause", status: "paused", reason: "quota_exhausted", providerFallbackAllowed: false
    });
  }
});

test("ordinary HTTP 429 rate limiting remains bounded and retryable", () => {
  assert.equal(classifyResourceFailure({ status: 429, message: "Too many requests" }), "rate_limited");
});

test("daily neuron gate fails closed when telemetry is missing or stale", () => {
  assert.equal(evaluateDailyNeuronBudget().reason, "daily_quota_usage_unknown");
  assert.equal(evaluateDailyNeuronBudget({
    usedNeurons: 1200,
    observedAt: "2026-11-14T00:00:00.000Z",
    sourceVerified: true,
    now: Date.parse("2026-11-14T01:00:00.000Z")
  }).reason, "daily_quota_observation_stale");
});

test("daily neuron gate preserves reserve and reports 50, 70, and 85 percent thresholds", () => {
  const now = Date.parse("2026-11-14T01:00:00.000Z");
  const check = usedNeurons => evaluateDailyNeuronBudget({
    usedNeurons,
    observedAt: "2026-11-14T00:55:00.000Z",
    sourceVerified: true,
    now
  });
  assert.equal(check(1000).status, "normal");
  assert.equal(check(3500).status, "restricted");
  assert.equal(check(4900).status, "high");
  assert.equal(check(5950).status, "critical");
  assert.equal(check(7000).allowModelCalls, false);
  assert.equal(check(7000).reason, "daily_neuron_budget_reached");
  assert.equal(check(6000).remainingBudget, 1000);
});
