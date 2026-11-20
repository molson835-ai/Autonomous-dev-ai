# Eve task-bound provider preflight

## Purpose

Bind the existing provider readiness and verified-usage preflight to one durable task record. This is a pure assessment boundary; it does not claim tasks, change task state, start a provider, or execute code.

## Required task state

- The task record must pass the existing task lifecycle validator.
- The task must already be in `running` state, meaning the persistent task store has claimed it.
- `owner_approved` must be exactly `true`.
- `mission_authorized` must be exactly `false`; standing mission authorization is not accepted.
- The task scope ID must be one of the owner-defined provider-eligible scopes: `product_development`, `testing`, `documentation`, or `market_research`.
- Free-text task title, goal, and approved scope never grant permissions. Scope eligibility is determined only by the persisted owner-defined `scope_id`.

## Provider gates

The task-bound layer delegates to the provider execution preflight. Provider readiness must contain fresh evidence for plan eligibility, commercial use, usage limits, billing controls, and isolation controls. Usage must be verified, match the selected provider, and remain below the 90% optional-work stop threshold.

## Result and authority

A successful result is `task_preflight_passed_not_executed`. It includes the task ID and bounded provider plan, but always returns `activationAllowed: false` and `executionAllowed: false`. A separate owner activation review is still required.

## Explicit non-goals

- No task claim, transition, queue mutation, resume, or persistence.
- No provider SDK/API call, sandbox/container creation, command execution, file transfer, package installation, or network access.
- No provider selection/failover or paid fallback.
- No billing changes, plan upgrades, production writes, or deployment.
- No new task scopes or expanded task authority.

## Verification

Run `node --test tests/task-provider-preflight.test.mjs` and the full repository CI. These tests validate the pure task-to-provider decision boundary only; they do not establish production queue wiring or provider execution capability.
