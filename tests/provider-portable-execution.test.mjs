import test from "node:test";
import assert from "node:assert/strict";
import { createExecutionPlan, listExecutionProviders, getExecutionProfile } from "../agent/lib/provider-runtime-policy.mjs";
import { evaluateExecutionUsage, getUsageThresholds } from "../agent/lib/execution-usage-policy.mjs";
import { validateExecutionCheckpoint, canResumeCheckpoint } from "../agent/lib/execution-checkpoint-policy.mjs";

test("both providers are represented but remain inactive", () => {
  const providers = listExecutionProviders();
  assert.deepEqual(providers.map((p) => p.id).sort(), ["cloudflare", "vercel"]);
  assert.ok(providers.every((p) => p.status === "candidate" && p.activationAllowed === false && p.networkPolicy === "deny-all"));
});

test("provider-neutral plans are bounded and never execute", () => {
  for (const provider of ["vercel", "cloudflare"]) {
    const plan = createExecutionPlan({ provider, profile: "node-test-pure-js", inputBytes: 100 });
    assert.equal(plan.valid, true);
    assert.equal(plan.status, "planned_not_executed");
    assert.equal(plan.activationAllowed, false);
    assert.equal(plan.limits.network, "deny-all");
    assert.equal(plan.limits.credentials, false);
  }
  assert.equal(createExecutionPlan({ provider: "vercel", profile: "node-test-pure-js", inputBytes: 1, command: "rm -rf /" }).valid, false);
  assert.equal(createExecutionPlan({ provider: "e2b", profile: "node-test-pure-js", inputBytes: 1 }).valid, false);
  assert.equal(createExecutionPlan({ provider: "cloudflare", profile: "node-test-pure-js", inputBytes: 1, timeoutMs: 60001 }).valid, false);
});

test("profiles have explicit defaults", () => {
  assert.equal(getExecutionProfile("node-test-pure-js").timeoutMs, 30000);
  assert.equal(getExecutionProfile("bounded-analysis").timeoutMs, 45000);
  assert.equal(getExecutionProfile("unknown"), null);
});

const usage = (overrides = {}) => ({ provider: "vercel", period: "2026-11", cpuUsed: 1, cpuLimit: 10, currency: "USD", sourceVerified: true, ...overrides });

test("usage policy maps thresholds to conservative actions", () => {
  assert.equal(evaluateExecutionUsage(usage({ cpuUsed: 4 })).action, "allow_within_configured_budget");
  assert.equal(evaluateExecutionUsage(usage({ cpuUsed: 5 })).action, "observe");
  assert.equal(evaluateExecutionUsage(usage({ cpuUsed: 7.5 })).action, "warn");
  assert.equal(evaluateExecutionUsage(usage({ cpuUsed: 9 })).action, "stop_optional");
  assert.equal(evaluateExecutionUsage(usage({ cpuUsed: 10 })).action, "stop_all");
  assert.deepEqual(getUsageThresholds(), { observe: 50, warn: 75, stopOptional: 90, stopAll: 100 });
});

test("unknown, unverified, incomplete, or malformed usage fails closed", () => {
  assert.equal(evaluateExecutionUsage({ ...usage(), sourceVerified: false }).action, "block");
  assert.equal(evaluateExecutionUsage({ ...usage(), cpuUsed: 2, cpuLimit: 0 }).action, "block");
  assert.equal(evaluateExecutionUsage({ ...usage(), cpuUsed: undefined, cpuLimit: undefined }).action, "block");
  assert.equal(evaluateExecutionUsage({ ...usage(), extra: true }).action, "block");
});

const checkpoint = (overrides = {}) => ({
  taskId: "task-123", checkpointId: "cp-1", sequence: 2, status: "paused",
  provider: "vercel", profile: "node-test-pure-js", createdAt: "2026-11-20T12:00:00Z",
  payload: { step: "tests", completed: ["unit"] }, ...overrides,
});

test("checkpoint validation is bounded, portable, and data-only", () => {
  assert.equal(validateExecutionCheckpoint(checkpoint()).status, "validated_not_persisted");
  assert.equal(validateExecutionCheckpoint(checkpoint({ payload: { api_key: "nope" } })).valid, false);
  assert.equal(validateExecutionCheckpoint(checkpoint({ payload: { data: "x".repeat(33 * 1024) } })).valid, false);
  assert.equal(validateExecutionCheckpoint(checkpoint({ extra: "no" })).valid, false);
});

test("resume requires owner approval and exact task sequence", () => {
  assert.equal(canResumeCheckpoint(checkpoint(), { taskId: "task-123", sequence: 2, ownerApproved: false }).resumable, false);
  assert.equal(canResumeCheckpoint(checkpoint(), { taskId: "task-123", sequence: 2, ownerApproved: true }).resumable, true);
  assert.equal(canResumeCheckpoint(checkpoint(), { taskId: "other", sequence: 2, ownerApproved: true }).resumable, false);
});
