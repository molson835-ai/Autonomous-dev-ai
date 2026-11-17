# Phase 4 — quota and execution guardrails

## Purpose

Keep EVE productive on free resources without allowing long contexts, excessive steps, retries, or provider failures to consume an unbounded allowance. Quota exhaustion must stop work safely; it must never trigger a paid provider, paid plan, billing change, or personal-funds use.

## Current policy module

`agent/lib/resource-budget.mjs` is a pure decision module. It classifies provider/runtime failures and returns bounded continuation decisions. It does not itself call providers, schedule work, persist state, or perform external actions.

Conservative per-turn defaults:

- 4 model/tool steps.
- 6 tool calls.
- 6,000 output characters.
- 4,000 reported tokens.
- 30-second application-level turn ceiling (not a statement of Vercel's platform timeout).
- At most 1 retry for eligible transient/rate-limit failures.
- 2 consecutive failures maximum.
- 24-hour maximum task age.

The agent context window is capped at 16,384 tokens to reduce oversized prompt/history transmission. This is a context ceiling, not a promise that every turn uses that many tokens.

## Daily neuron budget policy

Cloudflare's free daily allowance is measured in neurons, not OpenAI-compatible prompt/completion tokens. The policy target is 7,000 neurons/day, preserving 3,000 neurons from the published 10,000-neuron free allocation.

`evaluateDailyNeuronBudget` applies these rules:

- Missing, unverified, malformed, or stale usage observations fail closed and disallow model calls.
- At 50%, 70%, and 85% of the 7,000-neuron target, status moves through restricted, high, and critical.
- At 7,000 neurons, model calls are paused to preserve the 3,000-neuron reserve.
- An observation is stale after 15 minutes.
- Local token counts are never represented as authoritative neuron usage.

Deployment limitation: the code now queries account-wide Cloudflare Analytics from the trusted Memory Worker using a separate `CLOUDFLARE_ANALYTICS_API_TOKEN` secret, rather than accepting usage totals from Eve. Production enforcement is not live until that secret is provisioned with read-only Account Analytics permission and the Worker deployment is explicitly approved and verified. Missing credentials or telemetry errors fail closed.

## Failure handling

- Cloudflare Workers AI error code `4006`, or an explicit daily free-allocation/neuron-exhaustion message, is quota exhaustion even when HTTP status is 429. Pause immediately, with zero retries and no provider fallback.
- A generic HTTP 429 remains a rate-limit response and may yield for the single bounded retry.
- Authorization and permanent errors stop rather than retry.
- Transient failures yield with bounded exponential backoff.
- Checkpoint before yielding or pausing. Never discard unfinished work to work around quota limits.

## Runtime integration still required

1. Provision the Worker-only `CLOUDFLARE_ANALYTICS_API_TOKEN` with read-only Account Analytics permission in the `cloudflare-production` GitHub environment; do not expose it to EVE's prompt, tools, or Vercel runtime.
2. Deploy the Worker only after owner approval, then verify the analytics query against the live account without printing credentials.
3. Keep the shared daily gate on every model invocation and fail closed on missing, stale, regressed, or malformed telemetry.
4. Enforce one model-heavy task at a time and per-task call/step limits at the shared runtime boundary.
5. Cache research and compact summaries so repeated work does not resend full context.
6. Preserve checkpoints and conservatively settle interrupted streams; verify recovery with one controlled probe after reset.
7. Add owner-visible quota status with source, observation time, used/remaining neurons, threshold state, and explicit unknown/paused status.
8. Complete and pass tests for concurrency, stale telemetry, quota exhaustion, checkpoint preservation, and zero paid fallback.

## Release constraints

- No paid plan, paid provider, paid fallback, or billing changes.
- No Production deployment or merge without separate owner approval.
- Preview deployment is deferred until code and tests are ready and the owner approves use of deployment quota.
- Do not claim autonomous background quota protection until the runtime integration and closed-browser tests pass.


## Hybrid runtime integration

The model instance is wrapped with AI SDK v4 middleware. Both generate and stream calls obtain a shared Durable Object reservation before reaching Cloudflare. The Memory Worker—not Eve—queries Cloudflare GraphQL for the current UTC day's account-wide Workers AI neuron total, grouped only by date so all models and request sources are included. The request from Eve contains only the fixed reservation amount and model ID; caller-supplied usage totals and timestamps are rejected. Missing credentials, GraphQL errors, ambiguous aggregates, backwards-moving totals, or invalid usage fail closed. The Analytics credential is a Worker secret and never enters prompts, tools, or the Vercel runtime.

The MemoryStore Durable Object maintains daily observations, local usage estimates, outstanding reservations, and circuit state. Its synchronous request handler serializes read-modify-write operations. It rejects regressed telemetry and reserves against the greater of verified account usage and baseline plus local estimates plus outstanding reservations. The settlement amount remains an SDK-derived estimate; the next reservation refreshes the account-level authoritative aggregate. This is a defense-in-depth design, not proof that Cloudflare Analytics is instantaneous.

GLM-4.7-Flash's published neuron rates (5,500 per million input tokens and 36,400 per million output tokens) inform a 50%-margin settlement estimate. Valid estimates are not floored to 200; missing or invalid usage falls back conservatively to 200. Output is capped at 1,024 tokens; each call temporarily reserves 200 neurons. Cancelled or interrupted streams settle with the conservative fallback instead of leaving the reservation until midnight. EVE session limits cap new input at 16,384 tokens and output at 4,000 per continuation window. The account target remains 7,000 neurons, leaving a 3,000-neuron reserve. Provider error 4006 remains the hard stop if external or unmodelled use exceeds the target.

Preview deployment quota is not assumed to be excluded for feature branches. Unneeded queued Preview deployments are cancelled; no Production deployment has been performed.
