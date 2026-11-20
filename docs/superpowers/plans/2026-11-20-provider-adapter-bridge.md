# Provider Adapter Bridge v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a provider-neutral, offline-testable adapter boundary for Vercel and Cloudflare while keeping all runtime activation disabled.

**Architecture:** Both adapters consume a validated execution plan and an injected provider client. In this milestone they build and validate provider request descriptions only; they must never call the injected client or create resources. A readiness evaluator requires independently verified eligibility and control evidence but never grants activation.

**Tech Stack:** Node.js ES modules, existing `node:test` suite, TypeScript only where the Cloudflare Worker boundary requires it.

**Spec:** `docs/superpowers/specs/2026-11-20-provider-adapter-bridge-design.md`

## Global Constraints

- No SDK dependencies, provider API calls, sandbox/container creation, file transfer, command execution, package installation, network egress, or generated-code execution.
- Vercel and Cloudflare remain inactive candidates; `activationAllowed` is always false.
- No deployments, billing changes, plan upgrades, paid usage, secrets, or queue changes.
- All network policies are deny-all; all sandboxes are ephemeral, credential-free, and have no exposed ports.
- Preserve PR #71's 60-second hard timeout and profile-specific input/output limits.

## Review Focus

- Unsupported provider or extra request fields must fail closed.
- Missing or stale eligibility evidence must block readiness.
- A provider-client exception must not trigger automatic fallback.
- Cleanup failure must be surfaced as a failure, not reported as success.
- Any accidental attempt to invoke a provider client must be caught by tests.

---

### Task 1: Define the offline adapter contract

**Files:**
- Create: `agent/lib/provider-adapter-contract.mjs`
- Create: `tests/provider-adapter-contract.test.mjs`

**Interfaces:**
- `createProviderAdapter({ provider, client })` returns a provider adapter whose `prepare(request)` returns a normalized `prepared_not_executed` result.
- `client` is required as an injected dependency but must not be invoked in this milestone.
- `prepare(request)` accepts only the profiles and bounds already defined in `provider-runtime-policy.mjs`.

- [ ] Write tests proving both providers return a normalized prepared result and never invoke injected client methods.
- [ ] Run the targeted test and confirm it fails because the contract is absent.
- [ ] Implement the smallest contract that passes.
- [ ] Run the targeted test and the full `npm test` suite.

### Task 2: Add provider readiness gate

**Files:**
- Create: `agent/lib/provider-readiness-policy.mjs`
- Create: `tests/provider-readiness-policy.test.mjs`

**Interfaces:**
- `evaluateProviderReadiness(input)` returns `blocked` with explicit missing-evidence reasons, or `ready_for_separate_activation_review`.
- Required evidence: plan eligibility, commercial-use eligibility, usage limits, billing/spend controls, isolation controls; each item must include `verified: true`, a non-empty evidence reference, and a timezone-aware checked timestamp.
- Owner approval must be explicitly true.
- Every result includes `activationAllowed: false`.

- [ ] Write tests for missing, false, malformed, and complete evidence; confirm the complete case still cannot activate.
- [ ] Run the targeted test and confirm it fails because the evaluator is absent.
- [ ] Implement the evaluator with strict key validation and fail-closed behavior.
- [ ] Run the targeted test and the full `npm test` suite.

### Task 3: Document provider-specific boundaries

**Files:**
- Create: `docs/eve-provider-adapter-bridge.md`

- [ ] Document Vercel Node-side versus Cloudflare Worker-side architecture, current account-plan blockers, and the evidence required before activation.
- [ ] Confirm the documentation does not imply any runtime capability or deployment has been enabled.
- [ ] Run `npm test`, `npm run build`, and `npm run typecheck`; also run the existing Cloudflare Worker dry-run CI step through the PR workflow.

### Task 4: Review and open a draft PR

- [ ] Review the complete diff against the design spec and confirm no provider SDK/API call path exists.
- [ ] Open a draft PR only; do not mark ready, merge, deploy, or activate.
