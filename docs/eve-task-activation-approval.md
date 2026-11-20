# Eve task-specific provider activation approval

## Purpose

Define the next authorization boundary after task-bound provider preflight. The policy validates an exact, time-limited owner approval and produces a sanitized audit-event descriptor. It does not activate a provider or execute work.

## Trusted approval source

The `approval` object is valid only when loaded from trusted storage written by an owner-authenticated route. A model, task, caller, or arbitrary request body must never be allowed to assert `approvedBy: "owner"` or `status: "approved"` and have that assertion treated as proof of owner approval. This pure policy validates record shape and binding; it does not authenticate the issuer, check revocation in storage, or persist the audit event.

## Exact binding

An approval is bound to:
- One task ID.
- One provider (`vercel` or `cloudflare`).
- One execution profile.
- One exact timeout.
- An owner identity marker and approved status from the trusted approval store.
- An approval timestamp and expiry no more than 24 hours later.

Any mismatch, missing field, invalid timestamp, future approval, expired approval, or overlong validity window blocks the request.

## Result

A successful result is `owner_approved_prepared_not_activated`. It includes a sanitized audit-event descriptor. Both `activationAllowed` and `executionAllowed` remain false. A separate implementation and review is required before any provider activation path can exist.

## Non-goals

- No task queue claim, transition, or mutation.
- No owner approval creation, authentication, revocation, or persistence.
- No provider API/SDK call, sandbox creation, command execution, file transfer, package installation, or network access.
- No billing changes, plan upgrades, paid usage, production writes, or deployment.

## Verification

Run `node --test tests/task-activation-approval-policy.test.mjs` and full repository CI. These tests validate pure policy behavior only; they do not prove an authenticated approval store exists.
