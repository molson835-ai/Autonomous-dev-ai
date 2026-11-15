import assert from "node:assert/strict";
import test from "node:test";
import {
  createTaskRecord,
  isMissionAuthorizedTask,
  findIdempotentTask,
  isTaskLeaseExpired,
  selectNextTask,
  transitionTask,
  validateTaskRecord
} from "../agent/lib/task-lifecycle.mjs";

const now = "2026-11-13T00:00:00.000Z";
function proposed(overrides = {}) {
  return createTaskRecord({
    id: "task-001",
    idempotency_key: "request-001",
    task_type: "repo_maintenance",
    title: "Inspect failing tests",
    goal: "Identify and report the failing test",
    approved_scope: "Read repository and run tests only",
    ...overrides
  }, { now });
}
function queued(overrides = {}) {
  return transitionTask(proposed(overrides), "queued", { ownerApproved: true, now });
}

test("creates a valid proposed task without silently approving it", () => {
  const task = proposed();
  assert.equal(validateTaskRecord(task).valid, true);
  assert.equal(task.status, "proposed");
  assert.equal(task.owner_approved, false);
  assert.equal(task.mission_authorized, false);
  assert.equal(task.attempt_count, 0);
});

test("requires explicit owner approval before queueing", () => {
  assert.throws(() => transitionTask(proposed(), "queued", { now }), /owner_approval_required/);
  assert.equal(queued().owner_approved, true);
});

test("idempotency lookup returns the original record, not a duplicate", () => {
  const original = queued();
  assert.equal(findIdempotentTask([original], "request-001"), original);
  assert.equal(findIdempotentTask([original], "another-request"), null);
});

test("selector returns one due approved task and blocks while another task runs", () => {
  const first = queued({ id: "task-b", idempotency_key: "b" });
  const second = queued({ id: "task-a", idempotency_key: "a" });
  assert.equal(selectNextTask([first, second], { now: Date.parse(now) }).id, "task-a");
  const running = transitionTask(first, "running", { now });
  assert.equal(selectNextTask([running, second], { now: Date.parse(now) }), null);
});

test("selector skips unapproved, invalid, exhausted, and not-yet-due tasks", () => {
  const claimed = transitionTask(queued(), "running", { now });
  const waiting = transitionTask(claimed, "waiting", { now });
  const scheduled = Object.freeze({ ...transitionTask(waiting, "queued", { now }), next_run_at: "2026-11-14T00:00:00.000Z" });
  const exhausted = Object.freeze({ ...queued({ id: "task-x", idempotency_key: "x" }), attempt_count: 3 });
  assert.equal(selectNextTask([scheduled, exhausted], { now: Date.parse(now) }), null);
});

test("scheduled waiting tasks resume only when their checkpoint time is due", () => {
  const claimed = transitionTask(queued(), "running", { now });
  const blocked = transitionTask(claimed, "waiting", { now, checkpointSummary: "Waiting for owner input" });
  const resumable = transitionTask(claimed, "waiting", {
    now, checkpointSummary: "Safe checkpoint; continue next cycle",
    nextRunAt: "2026-11-13T00:15:00.000Z"
  });
  assert.equal(selectNextTask([blocked], { now: Date.parse("2026-11-14T00:00:00.000Z") }), null);
  assert.equal(selectNextTask([resumable], { now: Date.parse("2026-11-13T00:14:59.000Z") }), null);
  assert.equal(selectNextTask([resumable], { now: Date.parse("2026-11-13T00:15:00.000Z") }).id, resumable.id);
  const resumed = transitionTask(resumable, "running", { now: "2026-11-13T00:15:00.000Z" });
  assert.equal(resumed.status, "running");
  assert.equal(resumed.attempt_count, 2);
  assert.equal(resumed.next_run_at, null);
});

test("stale running task leases expire for crash recovery", () => {
  const running = transitionTask(queued(), "running", { now });
  assert.equal(isTaskLeaseExpired(running, { now: Date.parse(now) + 29 * 60 * 1000 }), false);
  assert.equal(isTaskLeaseExpired(running, { now: Date.parse(now) + 30 * 60 * 1000 }), true);
  assert.equal(isTaskLeaseExpired(queued(), { now: Date.parse(now) + 60 * 60 * 1000 }), false);
});

test("state machine rejects illegal transitions and stale expected state", () => {
  const task = queued();
  assert.throws(() => transitionTask(task, "succeeded", { now }), /invalid_task_transition/);
  assert.throws(() => transitionTask(task, "running", { expectedStatus: "waiting", now }), /task_state_conflict/);
});

test("claim increments attempts; checkpoint and terminal result are preserved", () => {
  const claimed = transitionTask(queued(), "running", { now });
  assert.equal(claimed.attempt_count, 1);
  const waiting = transitionTask(claimed, "waiting", {
    now, checkpointSummary: "Step 1 complete"
  });
  const resumed = transitionTask(waiting, "queued", { now });
  const claimedAgain = transitionTask(resumed, "running", { now });
  const done = transitionTask(claimedAgain, "succeeded", {
    now, resultSummary: "Test report ready", evidenceRefs: ["ci://run/123"]
  });
  assert.equal(done.attempt_count, 2);
  assert.equal(done.checkpoint_summary, "Step 1 complete");
  assert.equal(done.result_summary, "Test report ready");
  assert.deepEqual(done.evidence_refs, ["ci://run/123"]);
  assert.throws(() => transitionTask(done, "queued", { now }), /invalid_task_transition/);
});

test("pause and cancellation are honored without deleting task history", () => {
  const paused = transitionTask(queued(), "paused", { now });
  assert.equal(transitionTask(paused, "cancelled", { now }).status, "cancelled");
});

test("attempt budget is a hard stop", () => {
  const task = Object.freeze({ ...queued(), attempt_count: 3 });
  assert.throws(() => transitionTask(task, "running", { now }), /task_attempt_budget_exhausted/);
});

test("duplicate enqueue keys and malformed task records are handled explicitly", () => {
  assert.throws(() => createTaskRecord({ id: "x" }, { now }), /Invalid task record/);
  assert.equal(validateTaskRecord({ ...proposed(), status: "running" }).valid, false);
});

test("standing mission mandate auto-queues only allowlisted non-financial tasks", () => {
  const safe = { task_type: "customer_outreach", approved_scope: "Research relevant sellers and draft truthful, respectful messages using authorized no-cost channels." };
  assert.equal(isMissionAuthorizedTask(safe), true);
  const task = createTaskRecord({ id: "mission-1", idempotency_key: "mission-task-001", title: "Validate seller workflow", goal: "Conduct bounded customer discovery", ...safe }, { now, missionAuthorized: true });
  assert.equal(task.status, "queued");
  assert.equal(task.owner_approved, false);
  assert.equal(task.mission_authorized, true);
  assert.equal(validateTaskRecord(task).valid, true);
  assert.equal(selectNextTask([task], { now: Date.parse(now) }).id, task.id);
  assert.equal(isMissionAuthorizedTask({ task_type: "customer_outreach", approved_scope: "Purchase email lists and send bulk sales messages." }), false);
  assert.equal(isMissionAuthorizedTask({ task_type: "payments", approved_scope: "Set up checkout." }), false);
});
