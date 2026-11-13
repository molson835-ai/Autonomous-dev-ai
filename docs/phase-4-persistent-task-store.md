# Phase 4 — persistent task store API

## Scope

The Worker owns a dedicated `tasks` SQL table, separate from `memories` and `experiences`. This milestone exposes authenticated task proposal, read, owner approval, claim, and transition routes, plus model-callable tools for proposal/list/claim/checkpoint operations and a Vercel-hosted 15-minute schedule that claims only owner-approved tasks.

## API

- `POST /v1/tasks`: create a proposed task. An idempotency key is unique; repeat submissions return the original record.
- `GET /v1/tasks` and `GET /v1/tasks/:id`: inspect task records.
- `POST /v1/tasks/:id/approve`: owner-only transition from proposed to queued.
- `POST /v1/tasks/:id/owner-control`: owner-only `pause` or `resume` for an existing task. Resume reaffirms owner approval; ordinary Eve task transitions cannot resume a paused task.
- `POST /v1/proposals/:id/decision`: owner-only approval or rejection of a pending memory proposal.
- `POST /v1/tasks/claim-next`: claim at most one due owner-approved task. A running task blocks another claim. A waiting task is claimable only when it has a valid due `next_run_at` checkpoint.
- `POST /v1/tasks/:id/transition`: update status and checkpoint/result/evidence metadata under the lifecycle state machine. A `waiting` task with a due `next_run_at` can be resumed by the next scheduled claim; a waiting task without `next_run_at` remains blocked.

## Approval boundary

Normal Eve API access uses `MEMORY_API_TOKEN`. Task approval, task pause/resume, and memory-proposal approval/rejection require a separate `TASK_OWNER_APPROVAL_TOKEN`. If that separate secret is missing or equals the Eve API token, owner-only routes return unavailable. It must be configured out-of-band by the owner before any task can be approved or owner-controlled. This change does not set or rotate any production secret.

## Eve task tools

- `task_propose`: create an unapproved proposal; cannot approve or activate it.
- `task_list`: inspect recent tasks and approval state.
- `task_claim_next`: atomically claim one due approved task.
- `task_transition`: checkpoint, wait, pause, or finish the currently claimed task. It cannot approve, change scope, or resume a paused task.
- No task-approval or owner-control tool is exposed to Eve. The owner credential is never placed in Eve's runtime.

## Isolation and limits

- Tasks are stored in their own SQL table; existing memory and experience rows are not migrated, rewritten, or deleted.
- Task proposals start unapproved.
- Only approved tasks can be claimed.
- One active task at a time, a 30-minute stale-run recovery lease, at most three attempts, and terminal states cannot be reopened.
- The schedule is code only and is not active until a Production deployment containing this change is explicitly approved. No external action, customer contact, purchase, payment, or Production deployment is enabled by this PR.
- The queue remains inactive until owner approval credential provisioning and a separate scheduler milestone.

## Verification

The Cloudflare Workers Vitest suite exercises idempotency, separation from memory recall, owner-only approval, bounded single-task claiming, and checkpoint persistence. Passing tests validate the isolated Worker runtime, not production deployment.
