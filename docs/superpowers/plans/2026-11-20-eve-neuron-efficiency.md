# Eve neuron efficiency and recovery implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed per-call local charge with model-specific estimated settlement and make quota status and blockers visible to the owner.

**Architecture:** AI SDK middleware estimates neuron usage from provider-reported token counts using the configured model's published rates and a 50% margin. The Memory Worker retains a 200-neuron concurrency hold, validates settlement, and exposes a read-only owner-authenticated status view. The Owner Console displays estimates with an explicit source label.

**Tech Stack:** TypeScript, JavaScript ESM, Vercel Eve, AI SDK v4 middleware, Cloudflare Workers + Durable Objects, Vitest, Node test runner, Next.js.

**Spec:** `docs/superpowers/specs/2026-11-20-eve-neuron-efficiency-design.md`

## Global Constraints

- Keep the daily target at 7,000 neurons and protected reserve at 3,000 neurons.
- Do not treat token counts as actual neurons; use only the configured model's published rates for a labeled estimate.
- Missing or invalid usage falls back to 200 neurons.
- Do not clear historical local ledger entries or add a quota bypass/reset endpoint.
- Do not add paid providers, paid fallbacks, plan upgrades, or billing changes.
- Keep owner status read-only and owner-authenticated.
- Do not claim a general deterministic task dispatcher exists.

## Review Focus

- Missing or invalid AI SDK usage: settle the 200-neuron conservative fallback.
- Very small valid usage: do not floor the settlement to 200.
- Provider quota error 4006: open the circuit and do not retry.
- Local target exhaustion: return a reason distinct from provider circuit exhaustion.
- Unauthenticated quota status request: reject it without disclosing ledger data.

---

### Task 1: Model-specific usage estimate and middleware settlement

**Files:**
- Modify: `agent/lib/neuron-budget.mjs`
- Modify: `agent/lib/cloudflare-neuron-guard.ts`
- Test: `tests/neuron-budget.test.mjs`

- [x] Use the model's published input/output neuron rates and 50% margin.
- [x] Settle successful generate/stream calls from provider-reported usage.
- [x] Use 200 as the fallback when usage is absent or invalid.
- [ ] Verify typecheck and tests in CI.

### Task 2: Worker quota ledger and diagnostics

**Files:**
- Modify: `memory/worker/src/index.ts`
- Test: `memory/worker/test/worker.test.ts`
- Create: `agent/lib/quota-error.mjs`
- Create: `agent/lib/quota-error.d.mts`
- Modify: `agent/lib/memory-client.ts`
- Test: `tests/quota-error.test.mjs`

- [x] Require a fixed 200-neuron temporary reservation.
- [x] Accept validated model-estimated settlement values.
- [x] Return separate safe reason codes for local budget and provider circuit blocks.
- [x] Add authenticated read-only quota status, with an explicit local-estimate source label.
- [x] Map allowlisted reason codes to safe user-facing messages.
- [ ] Verify Worker tests and Node tests in CI.

### Task 3: Owner visibility and operating guidance

**Files:**
- Modify: `apps/web/app/api/owner/[...path]/route.ts`
- Modify: `apps/web/app/owner/owner-console.tsx`
- Modify: `agent/instructions.md`
- Modify: `docs/phase-4-quota-guardrails.md`

- [x] Expose the status route only through owner authentication in the Owner Console proxy.
- [x] Display local estimated usage, reservations, headroom, reserve, and circuit state.
- [x] Document batching, caching, context reduction, and deterministic-code preference.
- [x] Explicitly disclose that broad zero-neuron task execution is not yet implemented.
- [ ] Verify web build and full repository CI.

## Risks and dependencies

- The model-specific conversion is an estimate and does not replace Cloudflare's account-level usage meter.
- The local ledger does not observe other Workers AI consumers in the account.
- Existing fixed-charge ledger values remain for the current UTC day; new calls use the smaller reservation and usage-based settlement.
- No Worker or Production deployment is included.

## Acceptance criteria

- All targeted unit and Worker integration tests pass.
- Typecheck and web build pass.
- CI is green for the exact PR head.
- No merge or deployment is performed without separate approval.
