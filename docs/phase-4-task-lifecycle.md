# Phase 4 — task lifecycle and owner-control primitives

## Scope

This milestone includes pure task metadata and state-transition rules, a Durable Object-backed task API, owner-only approval and queue controls, and a bounded Production schedule. It does not authorize external actions or deploy itself to Production.

## Safety properties

- New tasks start as `proposed` and unapproved.
- Every task requires explicit owner approval. Standing mission authorization is disabled until a trusted owner-controlled delegation mechanism is designed, authenticated, and tested.
- The agent-facing task proposal API does not accept `scope_id`; any attempt to submit one is rejected.
- Customer discovery involving contact, customer outreach, offer publication, purchases, payments, and external side effects always require explicit owner approval.
- Existing mission-authorized tasks are revoked during Worker initialization. Unapproved nonterminal tasks are returned to `proposed`; owner-approved tasks retain their state. Historical task metadata is preserved.
- Only individually owner-approved queued/waiting tasks with `mission_authorized=0` are eligible for selection.
- The Worker returns both authorization flags with each claimed task; the schedule independently checks them and fails closed if either is missing or inconsistent.
- Active tasks can refresh their lease through an authenticated heartbeat. A heartbeat cannot approve, resume, or change task scope.
- The selector returns at most one task and refuses to select another while any task is running.
- Idempotency keys allow a future persistent store to return an existing task instead of inserting a duplicate.
- Attempt count is bounded (maximum three attempts).
- Terminal states cannot be reopened.
- State transitions require an expected prior state; the eventual storage layer must enforce this with an atomic compare-and-swap/update.
- Task metadata remains separate from the existing approved-memory and experience store.

## State machine

`proposed → queued → running → waiting → queued`

A running task may instead become `paused`, `succeeded`, `failed`, or `cancelled`. Queued/waiting tasks may be paused or cancelled. Paused tasks may resume to the queued state or be cancelled. Terminal states are immutable.

## Limits

- Three attempts maximum.
- One active task at a time.
- No agent self-approval or self-authorization. Automatic queueing from agent-created task proposals is disabled; owner approval is mandatory. Task creation remains bounded and idempotent.
- No secrets should be placed in task metadata, checkpoints, or summaries.
- The Worker performs conditional SQL updates for approval, claim, heartbeat, and transition operations. Lease recovery is bounded; long-running work must heartbeat every 10 minutes.

## Verification

Run `node --test tests/task-lifecycle.test.mjs` and the full repository CI. These tests validate the pure state machine, migration policy, Worker HTTP contract, heartbeat recovery, and schedule policy. They do not prove the Production deployment until the Worker and Vercel app are separately deployed and smoke-tested.
