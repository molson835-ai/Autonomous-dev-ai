import assert from "node:assert/strict";
import test from "node:test";
import { createTaskRecord, transitionTask } from "../agent/lib/task-lifecycle.mjs";
import { evaluateTaskProviderPreflight } from "../agent/lib/task-provider-preflight.mjs";

const now = "2026-11-20T12:00:00.000Z";
const evidenceCategories = ["planEligibility", "commercialUse", "usageLimits", "billingControls", "isolationControls"];

function runningTask(overrides = {}) {
  const proposed = createTaskRecord({
    id: "task-provider-001",
    idempotency_key: "provider-preflight-001",
    task_type: "repo_maintenance",
    title: "Run bounded local tests",
    goal: "Validate a pure JavaScript change",
    approved_scope: "Run automated tests only; no external side effects",
    scope_id: "testing",
    ...overrides,
  }, { now });
  const queued = transitionTask(proposed, "queued", { ownerApproved: true, now });
  return transitionTask(queued, "running", { now });
}

function input(overrides = {}) {
  const provider = "cloudflare";
  const evidence = Object.fromEntries(evidenceCategories.map((key) => [key, {
    verified: true,
    evidenceRef: `https://evidence.example/${key}`,
    checkedAt: "2026-11-20T11:00:00.000Z",
  }]));
  return {
    task: runningTask(),
    request: { provider, profile: "node-test-pure-js", inputBytes: 256 },
    readiness: { provider, ownerApproved: true, now, evidence },
    usage: {
      provider, period: "2026-11", sourceVerified: true, currency: "USD",
      cpuUsed: 20, cpuLimit: 100,
    },
    ...overrides,
  };
}

test("an approved running task can pass preflight but never gains execution authority", () => {
  const result = evaluateTaskProviderPreflight(input());
  assert.equal(result.valid, true);
  assert.equal(result.status, "task_preflight_passed_not_executed");
  assert.equal(result.taskId, "task-provider-001");
  assert.equal(result.activationAllowed, false);
  assert.equal(result.executionAllowed, false);
});

test("proposed, queued, waiting, paused, and terminal tasks cannot enter provider preflight", () => {
  const task = runningTask();
  for (const status of ["proposed", "queued", "waiting", "paused", "succeeded", "failed", "cancelled"]) {
    assert.equal(evaluateTaskProviderPreflight(input({ task: { ...task, status } })).status, "blocked", status);
  }
});

test("unapproved or mission-authorized task records fail closed", () => {
  const task = runningTask();
  assert.equal(evaluateTaskProviderPreflight(input({ task: { ...task, owner_approved: false } })).status, "blocked");
  assert.equal(evaluateTaskProviderPreflight(input({ task: { ...task, mission_authorized: true } })).status, "blocked");
});

test("owner-review and unknown task scopes are not eligible", () => {
  const task = runningTask();
  for (const scope_id of ["owner_review_required", "customer_outreach", "payments", "unknown_scope"]) {
    assert.equal(evaluateTaskProviderPreflight(input({ task: { ...task, scope_id } })).status, "blocked", scope_id);
  }
});

test("provider, usage, or readiness failure blocks the task preflight", () => {
  const base = input();
  assert.equal(evaluateTaskProviderPreflight({ ...base, request: { ...base.request, provider: "vercel" } }).status, "blocked");
  assert.equal(evaluateTaskProviderPreflight({ ...base, usage: { ...base.usage, sourceVerified: false } }).status, "blocked");
  assert.equal(evaluateTaskProviderPreflight({ ...base, readiness: { ...base.readiness, ownerApproved: false } }).status, "blocked");
});

test("90 percent utilization stops optional work before task-level provider preflight can pass", () => {
  const base = input();
  assert.equal(evaluateTaskProviderPreflight({
    ...base, usage: { ...base.usage, cpuUsed: 90 },
  }).status, "blocked");
});

test("malformed inputs and unknown top-level fields fail closed", () => {
  assert.equal(evaluateTaskProviderPreflight(null).status, "blocked");
  assert.equal(evaluateTaskProviderPreflight({ ...input(), unexpected: true }).status, "blocked");
});
