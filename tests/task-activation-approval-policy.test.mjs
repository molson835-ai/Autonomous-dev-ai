import assert from "node:assert/strict";
import test from "node:test";
import { prepareTaskActivationEnvelope } from "../agent/lib/task-activation-approval-policy.mjs";

const now = "2026-11-20T15:00:00.000Z";
const taskPreflight = {
  valid: true,
  status: "task_preflight_passed_not_executed",
  taskId: "task-123",
  provider: "cloudflare",
  profile: "node-test-pure-js",
  timeoutMs: 30_000,
  activationAllowed: false,
  executionAllowed: false,
};
const approval = {
  approvalId: "approval-123",
  taskId: "task-123",
  provider: "cloudflare",
  profile: "node-test-pure-js",
  timeoutMs: 30_000,
  status: "approved",
  approvedBy: "owner",
  approvedAt: "2026-11-20T14:00:00.000Z",
  expiresAt: "2026-11-20T16:00:00.000Z",
};

test("matching trusted owner approval creates an audit envelope but never activation authority", () => {
  const result = prepareTaskActivationEnvelope({ taskPreflight, approval }, { now });
  assert.equal(result.valid, true);
  assert.equal(result.status, "owner_approved_prepared_not_activated");
  assert.equal(result.auditEvent.outcome, "approved_but_not_activated");
  assert.equal(result.auditEvent.taskId, taskPreflight.taskId);
  assert.equal(result.activationAllowed, false);
  assert.equal(result.executionAllowed, false);
});

test("approval must match the exact task, provider, profile, and timeout", () => {
  for (const patch of [
    { taskId: "other-task" },
    { provider: "vercel" },
    { profile: "bounded-analysis" },
    { timeoutMs: 45_000 },
  ]) {
    assert.equal(prepareTaskActivationEnvelope({
      taskPreflight, approval: { ...approval, ...patch },
    }, { now }).status, "blocked");
  }
});

test("expired, future-dated, overlong, or malformed approvals fail closed", () => {
  const cases = [
    { expiresAt: "2026-11-20T14:59:59.000Z" },
    { approvedAt: "2026-11-20T15:01:00.000Z" },
    { expiresAt: "2026-11-21T15:00:01.000Z" },
    { approvedAt: "not-a-date" },
  ];
  for (const patch of cases) {
    assert.equal(prepareTaskActivationEnvelope({
      taskPreflight, approval: { ...approval, ...patch },
    }, { now }).status, "blocked");
  }
});

test("agent or system-generated approvals are not accepted as owner approval", () => {
  assert.equal(prepareTaskActivationEnvelope({
    taskPreflight, approval: { ...approval, approvedBy: "eve" },
  }, { now }).status, "blocked");
  assert.equal(prepareTaskActivationEnvelope({
    taskPreflight, approval: { ...approval, status: "pending" },
  }, { now }).status, "blocked");
});

test("invalid preflight and unknown properties fail closed", () => {
  assert.equal(prepareTaskActivationEnvelope({
    taskPreflight: { ...taskPreflight, executionAllowed: true }, approval,
  }, { now }).status, "blocked");
  assert.equal(prepareTaskActivationEnvelope({
    taskPreflight, approval: { ...approval, execute: true },
  }, { now }).status, "blocked");
  assert.equal(prepareTaskActivationEnvelope({ taskPreflight, approval, extra: true }, { now }).status, "blocked");
});
