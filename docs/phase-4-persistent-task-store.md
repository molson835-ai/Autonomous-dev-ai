# Phase 4 — persistent task store API

## Scope

The Worker owns a dedicated `tasks` SQL table, separate from `memories` and `experiences`. This milestone exposes authenticated task proposal, read, owner approval, claim, and transition routes. It does not start a schedule or execute tasks.

## API

- `POST /v1/tasks`: create a proposed task. An idempotency key is unique; repeat submissions return the original record.
- `GET /v1/tasks` and `GET /v1/tasks/:id`: inspect task records.
- `POST /v1/tasks/:id/approve`: owner-only transition from proposed to queued.
- `POST /v1/tasks/claim-next`: claim at most one due owner-approved task. A running task blocks another claim.
- `POST /v1/tasks/:id/transition`: update status and checkpoint/result/evidence metadata under the lifecycle state machine.

## Approval boundary

Normal Eve API access uses `MEMORY_API_TOKEN`. Owner approval requires a separate `TASK_OWNER_APPROVAL_TOKEN`. If that separate secret is missing or equals the Eve API token, approval returns unavailable. It must be configured out-of-band by the owner before any task can be queued. This change does not set or rotate any production secret.

## Isolation and limits

- Tasks are stored in their own SQL table; existing memory and experience rows are not migrated, rewritten, or deleted.
- Task proposals start unapproved.
- Only approved tasks can be claimed.
- One active task at a time, at most three attempts, and terminal states cannot be reopened.
- No task scheduler, background dispatcher, external action, customer contact, purchase, payment, or production activation is included.
- The queue remains inactive until owner approval credential provisioning and a separate scheduler milestone.

## Verification

The Cloudflare Workers Vitest suite exercises idempotency, separation from memory recall, owner-only approval, bounded single-task claiming, and checkpoint persistence. Passing tests validate the isolated Worker runtime, not production deployment.
