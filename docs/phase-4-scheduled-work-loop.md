# Phase 4 — scheduled owner-approved work loop

## Design

This adds one Eve-native schedule at `agent/schedules/owner-approved-work-loop.ts`:

- Cron: `0 14 * * *` (daily at 14:00 UTC). The actual Vercel Preview build returned `cron_jobs_limits_reached` with the explicit message that this Hobby account is limited to daily Cron Jobs; an hourly expression is rejected.
- Each invocation starts a fresh Eve session; it does not resume the prior chat.
- The session claims at most one due task through `task_claim_next`: either individually owner-approved or mission-authorized under a restricted allowlist of research, product development, testing, documentation, customer discovery, compliant outreach, and truthful offer publication. Queue read/write tools are disabled outside Vercel Production; Preview schedule invocations return a no-op without contacting the Production task store.
- It performs one bounded step, then records success, failure, or a checkpoint through `task_transition`.
- A safe continuation is scheduled by setting `waiting` with `resume_after_minutes: 1320` (22 hours), leaving a two-hour margin before the next daily run; the tool computes `next_run_at`.
- A waiting task without a continuation time remains blocked for owner input or a capability change.
- The task store's 30-minute stale-running lease recovers crashed or abandoned invocations, subject to the three-attempt limit.

## Host behavior

This Eve integration emits Vercel Cron Jobs, not the separate Vercel Schedules beta. The actual project deployment error is authoritative: Hobby allows only daily Cron Jobs. This schedule therefore runs once per day and requires no plan upgrade. Preview builds can also carry schedules, so the task tools fail closed outside Production.



Eve's schedule documentation confirms UTC execution, independent invocations, and no automatic retry after failed invocations. This project-specific Vercel deployment explicitly enforces the stricter Hobby daily limit. A continuation uses `resume_after_minutes: 1440`, and the next daily run reads the durable checkpoint. One daily schedule uses about 30 runs/month in each environment that carries it.

Sources:
- https://eve.dev/docs/schedules
- https://vercel.com/docs/cron-jobs/usage-and-pricing

## Capability limits

The schedule only uses tools available in the deployed Eve runtime. At this stage:
- The task queue supports individually owner-approved tasks and standing-mission-authorized tasks from a strict allowlist. The owner can pause the entire queue or an individual task.
- General web search remains unavailable until the separate web-search PR is merged and a free provider key is authorized and configured.
- Local file editing, shell execution, and direct GitHub repository operations are not yet established as Eve runtime tools. Tasks requiring those capabilities must wait rather than be falsely marked complete.
- No owner-approval tool is exposed to Eve; owner credentials are never placed in its runtime.

## Safety

No task can self-approve. The standing mission mandate auto-queues only restricted allowlisted task types with safe scopes; all other tasks remain proposed for owner review. The schedule cannot approve, resume paused tasks, cancel, or expand task scope. It may conduct truthful, relevant, lawful, privacy-respecting, platform-compliant customer discovery/outreach and publish accurate offers through existing authorized no-cost tools. If those tools are unavailable, it prepares drafts and records the blocker. It cannot create accounts, accept payments, purchase hardware, change billing, access personal financial accounts, merge code, or deploy Production. It pauses on explicit provider quota/rate-limit errors or unavailable capabilities. Runtime-wide model/tool usage metering is not yet wired into this schedule; the existing resource-budget module is policy-only. Therefore this PR does not claim hard per-turn token/tool-call enforcement or live Vercel/Cloudflare quota monitoring.

## Activation

This PR adds code and tests only. The schedule does not run on its cadence in `eve dev`; hosted Preview builds can carry it too, but the task tools fail closed outside Vercel Production and do not access the Production queue. The schedule can perform work only after the task-store code is deployed to Production and an owner-approved task exists. Production deployment still requires explicit approval. A live closed-browser execution test is required before claiming background autonomy.

## Verification

CI verifies the Eve build, TypeScript, task-store tests, and the schedule contract. This does not prove a production schedule has fired or that a scheduled task completed.
