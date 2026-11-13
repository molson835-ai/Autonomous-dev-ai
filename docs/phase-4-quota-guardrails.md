# Phase 4 — quota and execution guardrails

## Purpose

Keep Eve productive on free resources without letting retries, long turns, schedules, or provider failures consume an unbounded allowance. Quota exhaustion must stop work safely; it must never trigger a paid provider, paid plan, billing change, or personal-funds use.

## Implemented policy primitive

`agent/lib/resource-budget.mjs` is a pure decision module. It classifies provider/runtime failures and returns one of four outcomes:

- `continue`: measured work remains within the configured turn budget.
- `yield`: checkpoint and exit the current turn; transient failures receive bounded exponential backoff.
- `pause`: owner pause, emergency stop, or quota exhaustion.
- `stop`: terminal task, permanent failure, authorization failure, invalid usage measurement, expired task, or exhausted retry budget.

The module does not call providers, schedule work, write state, switch providers, or perform external actions. Runtime integration must persist each decision before acting on it.

## Conservative initial ceilings

- 8 model/tool steps per turn.
- 12 tool calls per turn.
- 12,000 output characters per turn.
- 10,000 reported tokens per turn.
- 45-second application-level turn ceiling (not a statement of Vercel's platform timeout).
- 3 retries and 3 consecutive failures.
- 24-hour maximum task age.
- Retry delay doubles from 1 minute to a 15-minute ceiling.

These are software guardrails, not claims about Vercel or Cloudflare plan quotas. Actual provider usage and Vercel compute/build/schedule quotas must be measured independently. If usage data is unavailable, do not assume capacity remains.

## Mandatory runtime integration requirements

1. Measure step, tool, output, token, and elapsed-time usage before continuation. If any required measurement is unavailable, fail closed and do not assume remaining capacity.
2. Persist a checkpoint and yield when any per-turn ceiling is reached.
3. Pause immediately on explicit quota exhaustion; do not try a different paid model/provider.
4. Treat HTTP 429 as rate limiting and back off; treat explicit quota/credit/usage-limit responses as quota exhaustion.
5. Stop on authorization/configuration failures and avoid retry storms.
6. Enforce idempotency and bounded retries; a duplicate schedule invocation must not duplicate task effects.
7. Honor owner pause, cancellation, and emergency stop before each continuation.
8. Keep task state separate from approved memories and experiences.
9. Keep schedule cadence conservative and inspect actual free-tier usage before enabling background work.
10. No Production schedule or runtime activation until a separate owner-approved release and closed-browser test.

## Limits and honesty

The pure policy module is implemented and testable, but it is not yet wired into Eve's model calls, task store, or a live schedule. It does not itself enforce a quota. Do not claim autonomous background execution or automatic quota protection is live until runtime integration and deployed tests pass.
