import { defineSchedule } from "eve/schedules";

export default defineSchedule({
  // This Vercel Hobby project permits only one Cron Job run per day.
  cron: "0 14 * * *",
  content: `Run one bounded step of the owner's durable work queue.

1. Call task_claim_next exactly once. The task store only returns a due task already approved by the owner. If no task is returned, stop without proposing or inventing work. The task-claim tool deliberately returns a skipped result outside Vercel Production, so Preview schedules cannot touch the Production queue.
2. Read the task's title, goal, and approved_scope. Work only inside that scope. This is a fresh session; use the task record and checkpoint, not assumed chat history.
3. Use only tools that are actually available in this runtime. If a required capability is missing, do not pretend to have completed the work. Record the blocker with task_transition(status="waiting") and omit resume_after_minutes so the task waits for owner action or a capability change.
4. Complete at most one bounded unit of work in this invocation. Do not run an unbounded loop or claim a result that was not verified.
5. If the task is complete, call task_transition(status="succeeded") with a concise result_summary and evidence_refs that identify observed evidence.
6. If the work can safely continue in another scheduled session, call task_transition(status="waiting") with a checkpoint_summary and resume_after_minutes of at least 1440. The tool calculates the timestamp.
7. If the task requires owner input, a new permission, a missing secret, an external commitment, or a safety decision, call task_transition(status="waiting") without resume_after_minutes and explain the exact blocker. Use status="paused" when continuing would be unsafe.
8. Use status="failed" only for a confirmed failure, with evidence. Never approve, resume, cancel, or expand a task yourself.

Hard boundaries: no personal funds or credit. No paid services, paid API fallback, or billing changes. No purchases or payment acceptance. No financial-account access. No customer contact, public offers, or contracts. No account creation. No hardware orders or shipments. No merges or Production deployments. No secret or owner token may be exposed to this runtime. If a provider explicitly reports quota exhaustion or rate limiting, pause the task and do not retry or switch providers. Do not infer that quota remains available from missing usage data; if a task requires quota status that is not exposed, wait for owner review.

Process one task only. The durable task store is the source of truth across sessions. A running task whose lease expires is recovered by the task store; do not create a duplicate task to work around it.`,
});
