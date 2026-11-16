# Phase 4 — task lifecycle and owner-control primitives

## Scope

This milestone defines pure, testable task metadata and state-transition rules. It does not add a database, API, Eve schedule, workflow dispatch, UI, or live background execution.

## Safety properties

- New tasks start as `proposed` and unapproved.
- Every task requires explicit owner approval. Standing mission authorization is disabled until a trusted owner-controlled delegation mechanism is designed, authenticated, and tested.
- The agent-facing task proposal API does not accept `scope_id`; any attempt to submit one is rejected.
- Customer discovery involving contact, customer outreach, offer publication, purchases, payments, and external side effects always require explicit owner approval.
- Existing mission-authorized tasks are revoked during Worker initialization. Unapproved nonterminal tasks are returned to `proposed`; owner-approved tasks retain their state. Historical task metadata is preserved.
- Only approved queued tasks are eligible for selection.
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
- The helper functions do not persist state or make transitions atomic; these are mandatory responsibilities of the next storage/API layer.

## Verification

Run `node --test tests/task-lifecycle.test.mjs` and the full repository CI. These tests validate only the pure state machine and selection policy; they do not prove a deployed queue or scheduler.
