const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const NON_WORK_TOOLS = new Set([
  "task_claim_next",
  "task_heartbeat",
  "task_transition",
  "task_list",
  "runtime_diagnostics",
  "memory_recall",
  "memory_record_experience",
]);

/**
 * Decide whether a settled Eve turn needs a deterministic task checkpoint.
 * The helper never infers task success and never retries an attempted transition.
 */
export function recoverableTaskCloseout({
  calls,
  outcome,
  sessionId,
  turnId,
}) {
  if (!Array.isArray(calls) || typeof sessionId !== "string" || !sessionId ||
      typeof turnId !== "string" || !turnId) return null;

  const turnCalls = calls.filter(call => call?.turnId === turnId && call?.kind === "tool");
  if (turnCalls.some(call => call.name === "task_transition")) return null;

  const claims = turnCalls.filter(call => call.name === "task_claim_next");
  if (claims.length !== 1 || claims[0].state !== "completed") return null;

  const task = claims[0].output?.task;
  if (!task || !UUID.test(task.id ?? "") || task.status !== "running" ||
      task.owner_approved !== true || task.mission_authorized !== false ||
      !Number.isInteger(task.step_count) || !Number.isInteger(task.max_steps) ||
      !Number.isInteger(task.attempt_count) || !Number.isInteger(task.max_attempts)) {
    return null;
  }

  const workCalls = turnCalls.filter(call => !NON_WORK_TOOLS.has(call.name));
  const hasCompletedWork = workCalls.some(call => call.state === "completed");
  const hasFailedWork = workCalls.some(call => call.state === "failed");
  const canContinue = outcome === "completed" && hasCompletedWork && !hasFailedWork &&
    task.step_count < task.max_steps && task.attempt_count < task.max_attempts;

  const status = canContinue ? "waiting" : "paused";
  const checkpointSummary = [
    "Automatic safety checkpoint: the Eve turn settled after claiming this individually owner-approved task but before calling task_transition.",
    "This is not evidence of task completion and does not certify the preceding work; inspect the prior tool results before continuing.",
    `Recovery trace: session ${sessionId}, turn ${turnId}.`,
    canContinue
      ? "A completed work call was recorded and no work-call failure was recorded; schedule the next bounded step."
      : "Automatic continuation was withheld because the turn failed or was cancelled, no completed work call was recorded, a work call failed, or a task budget was exhausted. Owner review is required.",
  ].join(" ");

  return {
    taskId: task.id,
    status,
    ...(canContinue ? { resumeAfterSeconds: 5 } : {}),
    checkpointSummary,
  };
}
