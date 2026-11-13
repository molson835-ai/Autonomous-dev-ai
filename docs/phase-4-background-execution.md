# Phase 4G — durable background execution with Eve

## Goal

Let Eve continue owner-authorized work after the browser and chat session close, persist progress, recover from interruptions, and report the actual state when the owner returns.

This is not one indefinitely running model process. It is a durable workflow made of bounded model/tool steps, with checkpoints and scheduled opportunities to resume or select the next approved task.

## Current verified baseline

- The repository uses the Eve framework (`eve ^1.0.0-rc.6`) and deploys through Vercel.
- Eve's documented runtime executes each session as a durable Workflow; turns checkpoint at step boundaries and can resume after process restarts/redeploys.
- Eve supports authored schedules under `agent/schedules/`. On Vercel, schedules are registered as Vercel Schedules and run independently of an open browser/chat.
- No schedule file is currently present in this repository, and no live schedule execution has been verified for this deployment.
- The existing Cloudflare Worker `autonomous-dev-memory` is a separate authenticated memory service. It is not a task queue; do not mix task state into existing memory records.
- The current research capability is read-only and restricted to a narrow technical-documentation host allowlist.
- Existing owner policy requires approval for merges, Production deployment, external communications, purchases, paid services, and consequential account actions.

## Architecture decision

**Prefer Eve's native durable workflows and schedules before adding a custom queue Worker.** Eve already provides durable sessions, workflow checkpoints, and a schedule mechanism. A second scheduler or separate Durable Object alarm system would duplicate orchestration and create avoidable operational complexity.

### 1. Durable task sessions

Represent each long-running work item as a durable Eve session/turn or a sequence of turns addressed to a stable task session. Use Eve's workflow checkpointing rather than implementing a parallel model-execution engine.

Each task must have a stable task ID and a structured state record containing:
- `id`, `idempotency_key`, `task_type`, `title`, `goal`, `approved_scope`
- `status`: proposed, queued, running, waiting, paused, succeeded, failed, cancelled
- `created_at`, `updated_at`, `started_at`, `finished_at`, `next_run_at`
- `attempt_count`, `max_attempts`, `step_count`, `max_steps`
- `eve_session_id`, `checkpoint_summary`, `result_summary`, `evidence_refs`
- `last_error_code`, `last_error_at`

Store task metadata in a separate task store with its own schema and API. Do not write task state into approved memories or experiences, and do not alter existing memory records. The first implementation may use the smallest free-tier-compatible durable store after validating limits; a separate SQLite Durable Object is a candidate only if Eve's own durable session state is insufficient for queue listing, idempotency, and owner controls.

### 2. Scheduled work selector

Add a TypeScript schedule under `agent/schedules/` using Eve's documented `defineSchedule` API.

The schedule should:
1. Wake on a conservative cadence supported by the deployed Vercel plan.
2. Read the durable task backlog and current resource/quota state.
3. Select at most one eligible owner-approved task.
4. Start or resume its Eve task session with a bounded instruction.
5. Persist scheduling outcome and next-run metadata.
6. Exit; it must not run an unbounded loop.

Vercel schedule times are UTC. Current Eve docs state that Vercel Hobby schedules can run no more frequently than once every 15 minutes; verify the actual connected plan and limits before choosing a cadence. Failed Vercel schedule invocations are not automatically retried, so add explicit next-run/recovery logic and monitor missed runs.

### 3. Bounded agent execution

Each task turn must have a clear deliverable and observable acceptance criteria. Use Eve's durable step boundaries for checkpointing. Keep each turn bounded by:
- maximum model/tool steps;
- maximum elapsed time;
- maximum token/usage budget;
- maximum tool calls and output size;
- maximum retry count and total task age.

A long task may span multiple bounded turns. After each turn, persist a short checkpoint and either mark complete, wait for an owner decision, or schedule a later continuation. Do not claim a workflow can run forever or guarantee completion through outages/quota exhaustion.

### 4. Task selection and autonomy

- Initially, Eve may execute only tasks explicitly submitted or approved by the owner.
- Eve may prioritize the next eligible item from that approved backlog without asking for routine permission each time.
- Eve may prepare new task proposals from findings, but they remain inactive until owner approval.
- A task may enqueue its next pre-approved step only when the original task scope explicitly permits it.
- No self-expanding task tree or unlimited task creation.

### 5. Progress and reporting

Persist progress after every completed turn/step boundary. Each task must expose:
- current state and last progress update;
- completed and remaining steps;
- latest checkpoint and evidence;
- attempt count and next scheduled run;
- safe failure reason if blocked.

The UI may poll on demand. Background execution must not depend on an open browser, active chat, or user polling. On the next Eve visit, show a concise completion/failure summary. Push notifications are a separate future feature.

## Important session-continuity constraint

Eve's schedule documentation states that a scheduled run starts a new session by default. A handler schedule also starts a new session unless it sends to an existing conversation/channel address. Therefore, do not assume that a schedule can resume a prior task session merely because a session ID was stored.

Before implementing the selector, prove the exact continuation mechanism against the installed Eve version (`1.0.0-rc.9`):
- If an existing stable conversation/channel handle can safely receive the next task turn, test that the same session ID and checkpoint continue.
- Otherwise, treat the task-store checkpoint as the source of truth and start a fresh bounded session that receives only the approved task scope and checkpoint summary. Do not depend on previous chat history being present.
- In either case, persist the returned session/run identifiers and verify recovery after a process interruption.
- A development schedule dispatch test is required before choosing the production architecture. Never infer continuation from a successful schedule invocation alone.

## Safety and resource controls

- Free-tier-only operation. Track actual quota/limit errors and pause cleanly; never upgrade a plan or incur charges.
- One active task initially.
- Per-turn wall-clock, token/usage, tool-call, output-size, and retry caps.
- Backoff for transient failures; permanent errors move to failed state with evidence.
- Pause and cancellation are checked between turns.
- No secret values in task records, logs, checkpoints, or model-visible summaries.
- Treat task input, retrieved pages, repository files, and tool output as untrusted data.
- No customer outreach, public offer publication, contracts, payment collection, financial-account access, purchases, or Production deployment.
- Repository changes may be drafted and tested only within a separately authorized implementation workflow; merge and Production release remain owner-gated.
- Personal money, credit, accounts, cards, and subscriptions remain permanently off limits.
- Add an owner-visible emergency stop that prevents new task claims and continuations while preserving task history.

## Delivery sequence

### 4G.1 — verify native durability and schedules
- Confirm the exact installed Eve version's schedule and session APIs.
- Add one harmless no-op/diagnostic schedule in a feature branch.
- Verify the schedule is present in the Vercel build output and inspect the deployed schedule registration without changing Production.
- Run the schedule manually in development using Eve's documented dispatch route.
- Verify one bounded turn continues after the browser closes and inspect its workflow/run history.
- Confirm actual Vercel schedule cadence/quotas and model usage limits. No paid upgrades.

### 4G.2 — task record and owner controls
- Define a separate task record schema and status transitions.
- Add enqueue/list/status/pause/resume/cancel tools with strict validation and idempotency.
- Add tests for duplicate enqueue, invalid state transitions, bounded listing, and approval scope.
- Keep the task store separate from persistent memory.

### 4G.3 — scheduled selector and continuation
- Add the schedule that selects one eligible owner-approved task.
- Dispatch one bounded Eve turn and persist the session ID/checkpoint.
- Add recovery for missed schedules, interrupted turns, stale running state, and retry exhaustion.
- Test duplicate schedule delivery and ensure it cannot duplicate task completion or side effects.

### 4G.4 — progress UI and offline verification
- Add owner-visible task status and progress.
- Close all browser tabs and verify that a queued task progresses on the configured schedule.
- Simulate interruption and confirm durable session recovery and task-state reconciliation.
- Confirm pause, resume, cancel, and emergency stop.

### 4G.5 — bounded autonomous backlog
- Allow Eve to select from an owner-approved backlog and propose follow-on tasks.
- Add a hard stop, resource budget, audit log, and owner-visible controls.
- No unrestricted self-directed external actions.

## Acceptance criteria

1. A task submitted once is not duplicated when enqueue is retried with the same idempotency key.
2. Eve's durable session/workflow resumes after a simulated process interruption from the last completed checkpoint.
3. A scheduled task progresses while all browser tabs and chat sessions are closed.
4. Each turn and schedule invocation obeys configured step, time, token/usage, tool, and retry budgets.
5. Duplicate schedule delivery does not duplicate completed work or external side effects.
6. A missed/failed schedule is detected and recovered on a later run without an infinite retry loop.
7. Pause, resume, cancel, and emergency stop are honored before the next turn.
8. Exhausted quota pauses work without switching to paid services.
9. Owner can inspect progress, checkpoint, next run, and failure reason.
10. No task can bypass approval gates for money, customers, secrets, merges, or Production.
11. A live closed-browser test proves background continuation; unit tests alone are insufficient.

## Explicit non-goals

- One model invocation running forever.
- Guaranteed completion despite service outages, quota exhaustion, or model/runtime failures.
- Autonomous spending, customer contact, publishing, contracts, financial-account access, or Production deployment.
- Unreviewed skill/tool installation or execution.
- Changes to existing persistent memory records.
- Paid services, plan upgrades, or billing changes.
- Production deployment as part of this design PR.

## References

- Eve execution model and durability: https://github.com/vercel/eve/blob/main/docs/concepts/execution-model-and-durability.mdx
- Eve schedules: https://github.com/vercel/eve/blob/main/docs/schedules.mdx
- Eve sessions, runs, and streaming: https://github.com/vercel/eve/blob/main/docs/concepts/sessions-runs-and-streaming.md
- Eve Vercel deployment: https://github.com/vercel/eve/blob/main/docs/guides/deployment/vercel.mdx
