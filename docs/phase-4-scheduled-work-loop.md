# Phase 4 — scheduled owner-approved work loop

## Design

This adds one Eve-native schedule at `agent/schedules/owner-approved-work-loop.ts`:

- Cron: `0 * * * *` (hourly). This is deliberately less frequent than the 15-minute minimum allowed on Hobby to keep free schedule usage conservative.
- Each invocation starts a fresh Eve session; it does not resume the prior chat.
- The session claims at most one due owner-approved task through `task_claim_next`. Queue read/write tools are disabled outside Vercel Production; Preview schedule invocations return a no-op without contacting the Production task store.
- It performs one bounded step, then records success, failure, or a checkpoint through `task_transition`.
- A safe continuation is scheduled by setting `waiting` with `resume_after_minutes`; the tool computes `next_run_at`.
- A waiting task without a continuation time remains blocked for owner input or a capability change.
- The task store's 30-minute stale-running lease recovers crashed or abandoned invocations, subject to the three-attempt limit.

## Host behavior

Vercel Schedules is in public beta on all plans. The current Hobby allowance includes 5,000 runs and 500 schedule creations per month; one hourly schedule uses about 720 runs/month per environment. Preview builds can also carry schedules, so the task tools fail closed outside Production.



Eve's current schedule documentation states that hosted Vercel builds run schedules in UTC, Hobby permits at most one run every 15 minutes, each schedule is an independent invocation, and failed invocations are not automatically retried. Vercel Schedules is in public beta on all plans; the current Hobby allowance is 5,000 runs and 500 schedule creations per month. The hourly cadence uses about 720 runs/month in each environment that carries the schedule. Each run relies on the durable task store rather than session continuity.

Sources:
- https://eve.dev/docs/schedules
- https://vercel.com/changelog/vercel-schedules-is-now-in-public-beta

## Capability limits

The schedule only uses tools available in the deployed Eve runtime. At this stage:
- The task queue tools are introduced in the same persistent-task-store change.
- General web search remains unavailable until the separate web-search PR is merged and a free provider key is authorized and configured.
- Local file editing, shell execution, and direct GitHub repository operations are not yet established as Eve runtime tools. Tasks requiring those capabilities must wait rather than be falsely marked complete.
- No owner-approval tool is exposed to Eve; owner credentials are never placed in its runtime.

## Safety

No task is automatically approved. The schedule cannot approve, resume, cancel, or expand task scope. It cannot contact customers, publish offers, create accounts, accept payments, purchase hardware, change billing, access personal financial accounts, merge code, or deploy Production. It pauses on missing usage measurements, quota exhaustion, or unavailable capabilities.

## Activation

This PR adds code and tests only. The schedule does not run on its cadence in `eve dev`; hosted Preview builds can carry it too, but the task tools fail closed outside Vercel Production and do not access the Production queue. The schedule can perform work only after the task-store code is deployed to Production and an owner-approved task exists. Production deployment still requires explicit approval. A live closed-browser execution test is required before claiming background autonomy.

## Verification

CI verifies the Eve build, TypeScript, task-store tests, and the schedule contract. This does not prove a production schedule has fired or that a scheduled task completed.
