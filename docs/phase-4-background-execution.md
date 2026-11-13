# Phase 4G — durable background execution architecture

## Goal

Let Eve continue owner-authorized work after the browser and chat session close. Work must survive process restarts, persist checkpoints, recover from transient failures, and report its actual state when the owner returns.

This is a sequence of bounded executions, not one indefinitely running model process. A scheduler wakes a durable queue, runs one bounded step, persists the result, and schedules the next step when appropriate.

## Current verified baseline

- Eve runs in the Vercel-hosted Eve/Next.js application.
- The existing Cloudflare Worker `autonomous-dev-memory` uses a SQLite-backed Durable Object for persistent memories and experiences.
- The memory Worker is authenticated with its own bearer secret. It is not a task scheduler.
- The repository does not currently define a durable task queue, an alarm handler for background work, or a server-to-server task execution endpoint.
- The current Eve research capability is read-only and restricted to a narrow documentation-host allowlist.
- The current owner policy requires approval for merges, Production deployment, external communications, purchases, paid services, and consequential account actions.

## Proposed architecture

### 1. Separate task service

Create a separate Cloudflare Worker and SQLite-backed Durable Object class for tasks. Do not mix task state with the existing memory database or alter existing memory records.

The Worker exposes a small authenticated API:
- `POST /v1/tasks`: enqueue an owner-authorized task with a stable idempotency key and explicit scope.
- `GET /v1/tasks/:id`: retrieve status, progress, timestamps, and last safe error.
- `GET /v1/tasks`: list a bounded page of recent tasks.
- `POST /v1/tasks/:id/cancel`: request cancellation.
- `POST /v1/tasks/:id/pause` and `resume`: owner controls.
- Internal-only execution callback: claim/complete one step using a task ID, lease token, and step sequence.

The public Eve chat route must not expose the task service without independent authentication. Never place the task API secret in browser code.

### 2. Durable queue and scheduler

A single-owner queue Durable Object is an acceptable first milestone. SQLite is the source of truth; in-memory state is never authoritative.

Suggested task fields:
- `id`, `idempotency_key`, `task_type`, `title`, `goal`, `scope_json`
- `status`: queued, running, waiting, paused, succeeded, failed, cancelled
- `created_at`, `updated_at`, `started_at`, `finished_at`, `next_run_at`
- `attempt_count`, `max_attempts`, `step_count`, `max_steps`
- `lease_token_hash`, `lease_expires_at`, `last_error_code`
- `progress_json`, `checkpoint_json`, `result_json`

Use a Durable Object alarm to wake the queue when work is due. Each alarm processes at most one bounded step (or a very small configured batch), commits its checkpoint/status before scheduling the next alarm, and returns. The alarm is not a continuously running process.

Cloudflare documents alarms as at-least-once, with automatic retry when the handler throws; therefore every step must be idempotent and guarded by task ID plus step sequence. Do not assume exactly-once execution. Use a lease to recover tasks left running after interruption.

### 3. Bounded execution adapter

The task scheduler must not embed an unbounded agent loop. It dispatches one bounded step to an execution adapter and expects a structured response:
- progress summary;
- checkpoint for the next step;
- completion, waiting, or retryable/permanent failure;
- requested tools/actions;
- evidence references.

Before implementation, run a technical spike against the installed Eve runtime to prove that a server-side invocation can be created and resumed without a browser session. If Eve does not provide a supported server-side continuation path, do not invent one. Compare a small authenticated Next.js internal route with a Cloudflare Workers AI step runner, using current official documentation and a minimal proof-of-concept before choosing.

No model call may exceed the configured per-step time/token budget. No task may exceed its maximum steps, elapsed time, retry count, or resource budget.

### 4. Task selection and autonomy

- Initially, Eve may execute only tasks explicitly submitted or approved by the owner.
- Eve may prioritize and select the next item from that approved queue without asking for routine permission each time.
- Eve may prepare new task proposals from its findings, but those proposals remain inactive until owner approval.
- A completed task may enqueue its next pre-approved step only when the original task scope explicitly permits it.
- No self-expanding task tree or unlimited task creation.

### 5. Progress and reporting

Persist progress after each bounded step. Each task must expose:
- current state and last progress update;
- completed and remaining steps;
- last checkpoint;
- attempt count and next scheduled run;
- safe failure reason if blocked;
- links/evidence for completed deliverables.

The UI may poll on demand; background execution must not depend on an open browser, active chat, or user polling. Provide a concise completion/failure summary when the user next opens Eve. Push notifications are a separate future feature and are not assumed here.

## Safety and resource controls

- Free-tier-only operation. Track observed quota/limit errors and pause cleanly; never upgrade a plan or incur charges.
- Global concurrency: one active task initially.
- Per-step wall-clock, token, tool-call, output-size, and retry caps.
- Backoff for transient failures; permanent errors move to failed state with evidence.
- Cancellation and pause are checked between steps.
- No secret values in task records, logs, checkpoints, or model-visible summaries.
- Treat task input, retrieved pages, repository files, and tool output as untrusted data.
- No customer outreach, public offer publication, contracts, payment collection, financial-account access, purchases, or Production deployment.
- Repository changes may be drafted and tested only within a separately authorized implementation workflow; merge and Production release remain owner-gated.
- Personal money, credit, accounts, cards, and subscriptions remain permanently off limits.
- Add an owner-visible emergency stop that prevents new claims and execution while preserving task history.

## Delivery sequence

### 4G.1 — runtime feasibility spike
- Inspect Eve package/runtime APIs and official docs.
- Prove a server-side invocation can execute one bounded task step without a browser.
- Demonstrate safe structured input/output and checkpoint continuation.
- Record actual free-tier limits and any cost uncertainty.
- No production changes.

### 4G.2 — task queue data model and API
- Implement a separate task Worker/DO and authenticated enqueue/status/pause/resume/cancel APIs.
- Add migration and isolated tests for state transitions, idempotency, leases, and bounded pagination.
- No model invocation yet.

### 4G.3 — alarm-driven step runner
- Add alarm scheduling, one-step dispatch, checkpoint writes, retry/backoff, lease recovery, and dead-letter/failure state.
- Test duplicate alarm delivery, crash between claim and completion, expired leases, cancellation, and quota exhaustion.
- Use mocked execution adapter until runtime spike passes.

### 4G.4 — Eve integration and owner controls
- Add authenticated server-to-server integration and task status UI.
- Start with explicitly approved tasks only.
- Verify work continues after closing the browser and resumes after simulated Worker/runtime interruption.

### 4G.5 — bounded autonomous backlog
- Allow Eve to select from an owner-approved backlog and propose follow-on tasks.
- Add a hard stop, resource budget, audit log, and owner-visible controls.
- No unrestricted self-directed external actions.

## Acceptance criteria

1. A task submitted once is not duplicated when the enqueue request is retried with the same idempotency key.
2. Task state and checkpoints survive Durable Object eviction/restart.
3. A task progresses while all browser tabs and chat sessions are closed.
4. Each scheduler wake runs no more than the configured bounded step budget.
5. Duplicate alarm delivery does not duplicate a completed step or external side effect.
6. A task left running by a simulated crash is recovered after its lease expires.
7. Retryable failures back off and stop at the configured attempt limit; permanent failures do not loop.
8. Pause, resume, and cancel are honored before the next step.
9. Exhausted quota pauses work without switching to paid services.
10. Owner can inspect progress, checkpoint, next run, and failure reason.
11. No task can bypass existing approval gates for money, customers, secrets, merges, or Production.
12. A live closed-browser test proves background continuation; a unit test alone is not sufficient.

## Explicit non-goals

- One model invocation running forever.
- Guaranteed completion despite service outages, quota exhaustion, or model/runtime failures.
- Autonomous spending, customer contact, publishing, contracts, financial-account access, or Production deployment.
- Unreviewed skill/tool installation or execution.
- Changes to existing persistent memory records.
- Paid services, plan upgrades, or billing changes.
- Production deployment as part of this design PR.

## References

- Cloudflare Durable Object alarms: https://developers.cloudflare.com/durable-objects/api/alarms/
- Cloudflare Durable Object limits: https://developers.cloudflare.com/durable-objects/platform/limits/
- Cloudflare Workers Cron Triggers (comparison only): https://developers.cloudflare.com/workers/configuration/cron-triggers/

