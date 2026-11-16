# Phase 4 — task lifecycle and owner-control primitives

## Scope

This milestone defines pure, testable task metadata and state-transition rules. It does not add a database, API, Eve schedule, workflow dispatch, UI, or live background execution.

## Safety properties

- New tasks start as `proposed` and unapproved.
- The only exception to individual task approval is the narrow standing mission allowlist: a task type must match an owner-defined `scope_id` in `agent/lib/task-lifecycle.mjs`. Free-text scope written by Eve never grants authority.
- Customer discovery involving contact, customer outreach, and offer publication always require explicit owner approval.
- Existing tasks created under the old free-text mission authorization are demoted to `proposed` during the Worker schema migration unless they match a fixed owner-defined scope ID.
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
- No agent self-approval or free-text self-authorization. Automatic queueing is limited to the four fixed internal-only scope IDs. Task creation remains bounded and idempotent.
- No secrets should be placed in task metadata, checkpoints, or summaries.
- The helper functions do not persist state or make transitions atomic; these are mandatory responsibilities of the next storage/API layer.

## Verification

Run `node --test tests/task-lifecycle.test.mjs` and the full repository CI. These tests validate only the pure state machine and selection policy; they do not prove a deployed queue or scheduler.
