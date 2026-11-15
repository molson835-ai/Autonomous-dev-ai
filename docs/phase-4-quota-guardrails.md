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

Important limitation: this commit adds the pure quota decision and Cloudflare error classifier, but it does not yet connect an authoritative account-level neuron telemetry source or enforce the daily gate around every model invocation. The current Cloudflare API token was scoped for Workers AI access; GraphQL account analytics requires a separate Analytics Read permission. Do not describe the daily gate as live until a verified source is connected and the model-call path consumes its decision.

## Failure handling

- Cloudflare Workers AI error code `4006`, or an explicit daily free-allocation/neuron-exhaustion message, is quota exhaustion even when HTTP status is 429. Pause immediately, with zero retries and no provider fallback.
- A generic HTTP 429 remains a rate-limit response and may yield for the single bounded retry.
- Authorization and permanent errors stop rather than retry.
- Transient failures yield with bounded exponential backoff.
- Checkpoint before yielding or pausing. Never discard unfinished work to work around quota limits.

## Runtime integration still required

1. Connect an authoritative, account-wide daily neuron usage source using a separately scoped Analytics Read credential; do not expose the credential to EVE's prompt or tools.
2. Persist the last verified usage observation and its timestamp in durable storage.
3. Enforce the daily gate before every Workers AI model invocation, across all runtime instances and concurrent sessions.
4. Enforce one model-heavy task at a time and per-task call/step limits at the shared runtime boundary.
5. Cache research and compact summaries so repeated work does not resend full context.
6. Pause on missing/stale telemetry or error 4006, preserve checkpoints, and verify recovery with one controlled probe after reset.
7. Add owner-visible quota status with source, observation time, used/remaining neurons, threshold state, and explicit unknown/paused status.
8. Test concurrency, stale telemetry, quota exhaustion, checkpoint preservation, and zero paid fallback.

## Release constraints

- No paid plan, paid provider, paid fallback, or billing changes.
- No Production deployment or merge without separate owner approval.
- Preview deployment is deferred until code and tests are ready and the owner approves use of deployment quota.
- Do not claim autonomous background quota protection until the runtime integration and closed-browser tests pass.


## Hybrid runtime integration

The model instance is wrapped with AI SDK v4 middleware. Both generate and stream calls obtain a shared Durable Object reservation before reaching Cloudflare. Streaming reservations settle only on the provider finish event; an interrupted stream keeps its reservation for the UTC day. Cloudflare error 4006 opens the circuit breaker and is never retried.

Before every model call, server-side middleware queries Cloudflare GraphQL for the current UTC day's account-wide Workers AI neuron total, grouped only by date so all models and request sources are included. Missing credentials, GraphQL errors, ambiguous aggregates, or invalid totals fail closed. The Cloudflare API token never enters prompts or tools.

The MemoryStore Durable Object maintains daily observations, local usage estimates, outstanding reservations, and circuit state. Its synchronous request handler serializes read-modify-write operations. It rejects stale or backwards-moving telemetry and reserves against the greater of observed account usage and baseline plus EVE's local estimates plus outstanding reservations.

GLM-4.7-Flash's published neuron rates (5,500 per million input tokens and 36,400 per million output tokens) inform a 50%-margin estimate. Output is capped at 1,024 tokens; each call reserves at least 200 neurons. EVE session limits cap new input at 16,384 tokens and output at 4,000 per continuation window. The account target remains 7,000 neurons, leaving a 3,000-neuron reserve. Provider error 4006 remains the hard stop if external or unmodelled use exceeds the target.

A feature-branch-only Vercel deployment exclusion is added so this code push does not consume Preview deployment quota. It does not disable deployments from main.
