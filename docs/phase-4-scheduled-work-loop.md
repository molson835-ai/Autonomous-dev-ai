# Phase 4 — scheduled owner-approved work loop

## Design

This adds one Eve-native schedule at `agent/schedules/owner-approved-work-loop.ts`:

- Cron: `0 14 * * *` (daily at 14:00 UTC). The actual Vercel Preview build returned `cron_jobs_limits_reached` with the explicit message that this Hobby account is limited to daily Cron Jobs; an hourly expression is rejected.
- Each invocation starts a fresh Eve session; it does not resume the prior chat.
- The session claims at most one due task through `task_claim_next`, and only when it is individually owner-approved or linked to an active server-enforced approved goal, with `mission_authorized=0`. The only active goal is `ebay-inventory-audit-development`, constrained to `products/ebay-inventory-audit/` and the `ebay_inventory_audit_development` scope. Standing mission authorization is disabled. Queue read/write tools are disabled outside Vercel Production; Preview schedule invocations return a no-op without contacting the Production task store.
- It performs one bounded step, then records success, failure, or a checkpoint through `task_transition`.
- A safe continuation is scheduled by setting `waiting` with `resume_after_seconds: 5`; the task store persists `next_run_at` and the Cloudflare Durable Object alarm wakes the Production Eve endpoint when it is due. The existing daily Eve schedule remains a fallback for queued work and alarm-delivery failures.
- A waiting task without a continuation time remains blocked for owner input or a capability change.
- The task store's 30-minute stale-running lease recovers crashed or abandoned invocations, subject to the three-attempt limit. Durable Object alarms are one-shot and are re-armed from persisted due tasks; alarm retries reuse Eve's stable `operationId` so an uncertain HTTP response cannot create duplicate sessions.

## Host behavior

This Eve integration's daily fallback schedule runs once per day on the current Hobby deployment. Short continuations do not rely on Vercel Cron: the existing Cloudflare MemoryStore Durable Object uses its one-shot Alarms API to call a Production-only Vercel route after the persisted task deadline. That route validates the shared Worker credential, rechecks queue/task eligibility, obtains the Vercel-issued OIDC token from the Function request context, and starts Eve through its existing `vercelOidc()` channel. The session create request uses a stable `operationId` derived from task ID and deadline, making retries idempotent. Preview builds and non-Production routes fail closed.



Eve's schedule documentation confirms UTC execution, independent invocations, and no automatic retry after failed invocations. This project-specific Vercel deployment explicitly enforces the stricter Hobby daily limit. A continuation uses `resume_after_minutes: 1320`, and the next daily run reads the durable checkpoint. One daily schedule uses about 30 runs/month in each environment that carries it.

Sources:
- https://eve.dev/docs/schedules
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://developers.cloudflare.com/durable-objects/api/alarms/

## Capability limits

The schedule only uses tools available in the deployed Eve runtime. At this stage:
- A task requires either individual owner approval or a goal ID and scope that match the Worker's hardcoded owner-approved goal registry. The initial registry contains only eBay inventory-audit development under `products/ebay-inventory-audit/`; all other tasks require individual owner approval. Legacy mission-authorized records are revoked during Worker initialization. The owner can pause the entire queue or an individual task through the separate owner console.
- General web search remains unavailable until the separate web-search PR is merged and a free provider key is authorized and configured.
- Local file editing, shell execution, and direct GitHub repository operations are not yet established as Eve runtime tools. Tasks requiring those capabilities must wait rather than be falsely marked complete.
- No owner-approval tool is exposed to Eve; owner credentials are never placed in its runtime.

## Safety

No task can self-approve or create a new approved goal. Tasks outside an active approved goal remain proposed until the owner individually approves their complete scope through the owner-only control path. Goal-authorized tasks remain visibly `owner_approved=false` and are eligible only when the Worker validates the exact goal ID, scope ID, task type, and project path. The schedule cannot approve, resume paused tasks, cancel, or expand task scope. Customer contact, direct outreach, sending messages, public offers, publication, form submission, account creation, contracts, payment acceptance, purchases, fulfillment, and shipping orders are prohibited without separate explicit owner approval for the exact external action. Until then, Eve may prepare drafts and evidence only. It cannot change billing, access personal financial accounts, merge protected branches, or deploy Production. It pauses on explicit provider quota/rate-limit errors or unavailable capabilities. Runtime-wide model/tool usage metering is not yet wired into this schedule; the existing resource-budget module is policy-only. Therefore this PR does not claim hard per-turn token/tool-call enforcement or live Vercel/Cloudflare quota monitoring.

## Activation

This PR adds code and tests only. The schedule does not run on its cadence in `eve dev`; hosted Preview builds can carry it too, but the task tools fail closed outside Vercel Production and do not access the Production queue. The schedule can perform work only after the task-store code is deployed to Production and an eligible individually owner-approved or server-authorized goal task exists. Production deployment still requires explicit approval. A live closed-browser execution test is required before claiming background autonomy.

## Verification

CI verifies the Eve build, TypeScript, task-store tests, and the schedule contract. This does not prove a production schedule has fired or that a scheduled task completed.
