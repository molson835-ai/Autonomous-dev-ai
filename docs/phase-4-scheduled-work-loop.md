# Phase 4 — scheduled owner-approved work loop

## Design

This adds one Eve-native schedule at `agent/schedules/owner-approved-work-loop.ts`:

- Cron: `*/15 * * * *` (Vercel Hobby's documented minimum interval).
- Each invocation starts a fresh Eve session; it does not resume the prior chat.
- The session claims at most one due owner-approved task through `task_claim_next`.
- It performs one bounded step, then records success, failure, or a checkpoint through `task_transition`.
- A safe continuation is scheduled by setting `waiting` with `resume_after_minutes`; the tool computes `next_run_at`.
- A waiting task without a continuation time remains blocked for owner input or a capability change.
- The task store's 30-minute stale-running lease recovers crashed or abandoned invocations, subject to the three-attempt limit.

## Host behavior

Eve's current schedule documentation states that hosted Vercel builds run schedules in UTC, Hobby permits at most one run every 15 minutes, each schedule is an independent invocation, and failed invocations are not automatically retried. Each run therefore relies on the durable task store rather than session continuity.

Sources:
- https://eve.dev/docs/schedules
- https://vercel.com/docs/cron-jobs/usage-and-pricing

## Capability limits

The schedule only uses tools available in the deployed Eve runtime. At this stage:
- The task queue tools are introduced with the stacked persistent-task-store PR.
- General web search remains unavailable until the separate web-search PR is merged and a free provider key is authorized and configured.
- Local file editing, shell execution, and direct GitHub repository operations are not yet established as Eve runtime tools. Tasks requiring those capabilities must wait rather than be falsely marked complete.
- No owner-approval tool is exposed to Eve; owner credentials are never placed in its runtime.

## Safety

No task is automatically approved. The schedule cannot approve, resume, cancel, or expand task scope. It cannot contact customers, publish offers, create accounts, accept payments, purchase hardware, change billing, access personal financial accounts, merge code, or deploy Production. It pauses on missing usage measurements, quota exhaustion, or unavailable capabilities.

## Activation

This PR adds code and tests only. The schedule does not run in `eve dev`; it fires on a hosted production build. It remains inactive until the stacked task-store work and this schedule are reviewed, merged, and explicitly approved for Production deployment. A live closed-browser execution test is required before claiming background autonomy.

## Verification

CI verifies the Eve build, TypeScript, task-store tests, and the schedule contract. This does not prove a production schedule has fired or that a scheduled task completed.
