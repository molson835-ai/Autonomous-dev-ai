import assert from "node:assert/strict";
import test from "node:test";
import {
  createTaskRecord,
  isMissionAuthorizedTask,
  isGoalAuthorizedTask,
  isTaskAuthorized,
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

test("the final stale-lease recovery exhausts retries, records failure time, and cannot be reclaimed", () => {
  let task = transitionTask(queued({ id: "stale-final", idempotency_key: "stale-final" }), "running", { now });
  task = transitionTask(task, "waiting", {
    now: "2026-11-13T00:31:00.000Z",
    countAttempt: true,
    nextRunAt: "2026-11-13T00:31:00.000Z",
    checkpointSummary: "Recovered after stale run 1"
  });
  task = transitionTask(task, "running", { now: "2026-11-13T00:31:00.000Z" });
  task = transitionTask(task, "waiting", {
    now: "2026-11-13T01:02:00.000Z",
    countAttempt: true,
    nextRunAt: "2026-11-13T01:02:00.000Z",
    checkpointSummary: "Recovered after stale run 2"
  });
  task = transitionTask(task, "running", { now: "2026-11-13T01:02:00.000Z" });
  const failedAt = "2026-11-13T01:33:00.000Z";
  const failed = transitionTask(task, "failed", {
    now: failedAt,
    countAttempt: true,
    resultSummary: "Execution lease expired on the final allowed attempt; no further retry."
  });

  assert.equal(failed.status, "failed");
  assert.equal(failed.attempt_count, failed.max_attempts);
  assert.equal(failed.max_attempts, 3);
  assert.equal(failed.finished_at, failedAt);
  assert.equal(failed.next_run_at, null);
  assert.equal(selectNextTask([failed], { now: Date.parse(failedAt) + 60 * 60 * 1000 }), null);
  assert.throws(() => transitionTask(failed, "running", { now: failedAt }), /invalid_task_transition/);
});

test("only the exact owner-approved eBay goal can authorize autonomous task records", () => {
  const goalTask = createTaskRecord({
    id: "ebay-goal-001", idempotency_key: "ebay-goal-request-001",
    task_type: "development", title: "Implement CSV reconciliation",
    goal: "Improve the eBay inventory audit utility",
    approved_scope: "Modify and test files only under products/ebay-inventory-audit/.",
    scope_id: "ebay_inventory_audit_development",
    goal_id: "ebay-inventory-audit-development",
  }, { now });
  assert.equal(goalTask.status, "queued");
  assert.equal(goalTask.owner_approved, false);
  assert.equal(goalTask.mission_authorized, false);
  assert.equal(isGoalAuthorizedTask(goalTask), true);
  assert.equal(isTaskAuthorized(goalTask), true);
  assert.equal(selectNextTask([goalTask], { now: Date.parse(now) }).id, goalTask.id);
  const running = transitionTask(goalTask, "running", { now });
  assert.equal(running.owner_approved, false);
  const waiting = transitionTask(running, "waiting", { now, nextRunAt: "2026-11-13T00:05:00.000Z" });
  const resumed = transitionTask(waiting, "queued", { now });
  assert.equal(resumed.status, "queued");
  assert.equal(resumed.owner_approved, false);
});

test("goal ID alone cannot authorize another goal, scope, task type, or project path", () => {
  const invalid = [
    { goal_id: "general-revenue-mission", scope_id: "ebay_inventory_audit_development", task_type: "development", approved_scope: "products/ebay-inventory-audit/" },
    { goal_id: "ebay-inventory-audit-development", scope_id: "product_development", task_type: "development", approved_scope: "products/ebay-inventory-audit/" },
    { goal_id: "ebay-inventory-audit-development", scope_id: "ebay_inventory_audit_development", task_type: "outreach", approved_scope: "products/ebay-inventory-audit/" },
    { goal_id: "ebay-inventory-audit-development", scope_id: "ebay_inventory_audit_development", task_type: "development", approved_scope: "modify the whole repository" },
  ];
  for (const [index, metadata] of invalid.entries()) {
    assert.throws(() => createTaskRecord({
      id: `invalid-goal-${index}`, idempotency_key: `invalid-goal-request-${index}`,
      title: "Invalid goal task", goal: "Attempt to expand scope", ...metadata,
    }, { now }), /Invalid approved-goal task scope/);
  }
  assert.equal(isGoalAuthorizedTask({
    goal_id: "ebay-inventory-audit-development", scope_id: "ebay_inventory_audit_development",
    task_type: "development", approved_scope: "products/ebay-inventory-audit/", mission_authorized: true,
  }), false);
});
