# Phase 4 — durable task lifecycle and owner-control primitives

## Authorization model

- Tasks outside an active owner-approved goal remain `proposed` with `owner_approved=false` until the owner approves them through the owner-only control path.
- The initial server-owned approved-goal registry contains exactly one goal: `ebay-inventory-audit-development`, scoped to `products/ebay-inventory-audit/` and the `ebay_inventory_audit_development` scope.
- Tasks linked to that exact goal may be created as `queued` with `owner_approved=false`. The Worker validates the goal ID, allowed task type, scope ID, and project path at creation and revalidates them at claim, heartbeat, and scheduled wake-up.
- Agent-supplied metadata cannot create a new goal, change the registry, select an arbitrary scope ID, or enable legacy `mission_authorized` authority. Legacy mission-authorized records are revoked during Worker initialization.
- Goal authorization is limited to internal research, planning, development, testing, documentation, and maintenance for the eBay inventory-audit project. It does not authorize customer contact, outreach, publication, purchases, payments, paid services, account changes, Production deployment, protected-branch merge, or work outside the approved project path.
- Every task remains traceable through an idempotency key, goal ID (when applicable), task type, checkpoint, result, and evidence references. The owner can inspect, pause, resume, or cancel tasks through the Owner Console.

## State machine and execution

`proposed → queued → running → waiting → queued`

A running task may instead become `paused`, `succeeded`, `failed`, or `cancelled`. Queued/waiting tasks may be paused or cancelled. Paused tasks require owner control to resume. Terminal states are immutable.

- One active task at a time.
- Three stale-run attempts maximum.
- Ten progress steps maximum per task.
- At most one task is claimed per scheduled invocation.
- Waiting tasks resume only when their persisted checkpoint time is due; the Worker alarm and daily schedule both revalidate eligibility.
- Task completion requires a result summary and concrete evidence references.
- No secrets belong in task metadata, checkpoints, or summaries.

## Verification

Pure lifecycle tests validate goal authorization and state transitions. Worker integration tests validate task creation, rejection of out-of-scope goals, claim, and scheduled wake-up eligibility. CI remains the required full verification before merge. No production behavior changes until a separately approved Worker deployment.
