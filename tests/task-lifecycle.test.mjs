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
    scope_id: "owner_review_required",
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
  assert.equal(task.step_count, 0);
  assert.equal(task.max_steps, 10);
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
  assert.equal(resumed.attempt_count, 0);
  assert.equal(resumed.step_count, 2);
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

test("claim increments progress steps, not stale-run retries; checkpoint and terminal result are preserved", () => {
  const claimed = transitionTask(queued(), "running", { now });
  assert.equal(claimed.attempt_count, 0);
  assert.equal(claimed.step_count, 1);
  const waiting = transitionTask(claimed, "waiting", {
    now, checkpointSummary: "Step 1 complete"
  });
  const resumed = transitionTask(waiting, "queued", { now });
  const claimedAgain = transitionTask(resumed, "running", { now });
  const done = transitionTask(claimedAgain, "succeeded", {
    now, resultSummary: "Test report ready", evidenceRefs: ["ci://run/123"]
  });
  assert.equal(done.attempt_count, 0);
  assert.equal(done.step_count, 2);
  assert.equal(done.checkpoint_summary, "Step 1 complete");
  assert.equal(done.result_summary, "Test report ready");
  assert.throws(() => transitionTask(claimedAgain, "succeeded", { now, resultSummary: "No evidence supplied" }), /task_completion_evidence_required/);
  assert.deepEqual(done.evidence_refs, ["ci://run/123"]);
  assert.throws(() => transitionTask(done, "queued", { now }), /invalid_task_transition/);
});

test("pause and cancellation are honored without deleting task history", () => {
  const paused = transitionTask(queued(), "paused", { now });
  assert.equal(transitionTask(paused, "cancelled", { now }).status, "cancelled");
});

test("stale-run retry budget and progress-step budget are independent", () => {
  let task = queued({ id: "multi-step", idempotency_key: "multi-step" });
  for (let step = 1; step <= 5; step += 1) {
    task = transitionTask(task, "running", { now });
    assert.equal(task.step_count, step);
    assert.equal(task.attempt_count, 0);
    if (step < 5) task = transitionTask(task, "waiting", { now, nextRunAt: "2026-11-14T00:00:00.000Z" });
  }
  let capped = queued({ id: "step-cap", idempotency_key: "step-cap" });
  for (let step = 0; step < 10; step += 1) {
    capped = transitionTask(capped, "running", { now });
    if (step < 9) capped = transitionTask(capped, "waiting", { now, nextRunAt: "2026-11-14T00:00:00.000Z" });
  }
  capped = transitionTask(capped, "waiting", { now, nextRunAt: "2026-11-14T00:00:00.000Z" });
  assert.throws(() => transitionTask(capped, "running", { now }), /task_step_budget_exhausted/);

  const stale = transitionTask(queued({ id: "stale", idempotency_key: "stale" }), "running", { now });
  const recovered = transitionTask(stale, "waiting", { now, countAttempt: true, nextRunAt: "2026-11-14T00:00:00.000Z" });
  assert.equal(recovered.step_count, 1);
  assert.equal(recovered.attempt_count, 1);
});

test("attempt budget is a hard stop", () => {
  const task = Object.freeze({ ...queued(), attempt_count: 3 });
  assert.throws(() => transitionTask(task, "running", { now }), /task_attempt_budget_exhausted/);
});

test("duplicate enqueue keys and malformed task records are handled explicitly", () => {
  assert.throws(() => createTaskRecord({ id: "x" }, { now }), /Invalid task record/);
  assert.equal(validateTaskRecord({ ...proposed(), status: "running" }).valid, false);
});

test("agent-supplied metadata can never grant standing mission authorization", () => {
  assert.equal(isMissionAuthorizedTask({
    task_type: "market_research",
    scope_id: "public_web_research_no_contact",
    approved_scope: "Research public information only.",
  }), false);
  assert.throws(() => createTaskRecord({
    id: "mission-unsafe", idempotency_key: "mission-unsafe-001",
    task_type: "market_research", scope_id: "public_web_research_no_contact",
    title: "Research a market", goal: "Compare public information",
    approved_scope: "No external actions.",
  }, { now, missionAuthorized: true }), /Invalid mission-authorized task scope/);
});
