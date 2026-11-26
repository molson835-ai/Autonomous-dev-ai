import test from "node:test";
import assert from "node:assert/strict";
import { recoverableTaskCloseout } from "../../agent/lib/task-closeout-recovery.mjs";

const task = {
  id: "32230f80-cd29-4c76-b0aa-0aa95166850a",
  status: "running",
  owner_approved: true,
  mission_authorized: false,
  step_count: 3,
  max_steps: 10,
  attempt_count: 0,
  max_attempts: 3,
};

function call(name, overrides = {}) {
  return {
    name,
    kind: "tool",
    state: "completed",
    turnId: "turn-1",
    output: {},
    ...overrides,
  };
}

function scenario({ calls = [], outcome = "completed" } = {}) {
  return recoverableTaskCloseout({
    calls,
    outcome,
    sessionId: "session-123",
    turnId: "turn-1",
  });
}

test("automatically checkpoints a claimed approved task after useful completed work omits closeout", () => {
  const result = scenario({
    calls: [
      call("task_claim_next", { output: { task } }),
      call("research_revenue_opportunity", { output: { leads: [] } }),
    ],
  });

  assert.equal(result.taskId, task.id);
  assert.equal(result.status, "waiting");
  assert.equal(result.resumeAfterSeconds, 5);
  assert.match(result.checkpointSummary, /automatic safety checkpoint/i);
  assert.match(result.checkpointSummary, /not evidence of task completion/i);
  assert.match(result.checkpointSummary, /session-123/);
  assert.match(result.checkpointSummary, /turn-1/);
});

test("pauses instead of scheduling continuation when the turn did not complete", () => {
  const result = scenario({
    outcome: "failed",
    calls: [
      call("task_claim_next", { output: { task } }),
      call("research_revenue_opportunity"),
    ],
  });

  assert.equal(result.status, "paused");
  assert.equal(result.resumeAfterSeconds, undefined);
});

test("pauses when a claimed task has no completed substantive work", () => {
  const result = scenario({
    calls: [
      call("task_claim_next", { output: { task } }),
      call("task_heartbeat"),
    ],
  });

  assert.equal(result.status, "paused");
});

test("pauses when a substantive work call failed, even if another work call completed", () => {
  const result = scenario({
    calls: [
      call("task_claim_next", { output: { task } }),
      call("research_sources", { state: "failed" }),
      call("research_revenue_opportunity"),
    ],
  });

  assert.equal(result.status, "paused");
  assert.equal(result.resumeAfterMinutes, undefined);
});

test("does not retry closeout when task_transition was already attempted, even if it failed", () => {
  const result = scenario({
    calls: [
      call("task_claim_next", { output: { task } }),
      call("research_revenue_opportunity"),
      call("task_transition", { state: "failed" }),
    ],
  });

  assert.equal(result, null);
});

test("does not recover a claim unless owner approval and mission authorization are exact", () => {
  for (const unsafeTask of [
    { ...task, owner_approved: false },
    { ...task, owner_approved: undefined },
    { ...task, mission_authorized: true },
    { ...task, mission_authorized: undefined },
    { ...task, status: "waiting" },
  ]) {
    assert.equal(scenario({
      calls: [
        call("task_claim_next", { output: { task: unsafeTask } }),
        call("research_revenue_opportunity"),
      ],
    }), null);
  }
});

test("does not recover ambiguous multiple claims or a missing task result", () => {
  assert.equal(scenario({
    calls: [
      call("task_claim_next", { output: { task } }),
      call("task_claim_next", { output: { task } }),
      call("research_revenue_opportunity"),
    ],
  }), null);
  assert.equal(scenario({
    calls: [call("task_claim_next", { output: { task: null } })],
  }), null);
});

test("ignores calls from other turns when deciding whether closeout was omitted", () => {
  const result = scenario({
    calls: [
      call("task_claim_next", { output: { task }, turnId: "old-turn" }),
      call("research_revenue_opportunity"),
    ],
  });

  assert.equal(result, null);
});

test("pauses at exhausted progress or stale-attempt budget", () => {
  for (const exhaustedTask of [
    { ...task, step_count: 10 },
    { ...task, attempt_count: 3 },
  ]) {
    const result = scenario({
      calls: [
        call("task_claim_next", { output: { task: exhaustedTask } }),
        call("research_revenue_opportunity"),
      ],
    });
    assert.equal(result.status, "paused");
    assert.equal(result.resumeAfterMinutes, undefined);
  }
});
