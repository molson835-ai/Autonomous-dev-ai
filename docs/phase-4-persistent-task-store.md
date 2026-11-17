# Phase 4 — persistent task store API

## Scope

The Cloudflare Worker owns a dedicated `tasks` SQL table, separate from `memories` and `experiences`. It exposes authenticated task proposal, read, owner approval, claim, and transition routes, plus model-callable tools for proposal/list/claim/checkpoint operations and a Vercel-hosted daily schedule that claims only owner-approved tasks.

## API

- `POST /v1/tasks`: create a proposed task. An idempotency key is unique; repeat submissions return the original record.
- `GET /v1/tasks` and `GET /v1/tasks/:id`: inspect task records using the Eve API credential.
- `POST /v1/tasks/:id/approve`: owner-only transition from proposed to queued.
- `POST /v1/tasks/:id/owner-control`: owner-only `pause` or `resume` for an existing task. Resume reaffirms owner approval; ordinary Eve task transitions cannot resume a paused task.
- `POST /v1/proposals/:id/decision`: owner-only approval or rejection of a pending memory proposal.
- `POST /v1/tasks/claim-next`: claim at most one due owner-approved task. A running task blocks another claim. A waiting task is claimable only when it has a valid due `next_run_at` checkpoint.
- `POST /v1/tasks/:id/transition`: update status and checkpoint/result/evidence metadata under the lifecycle state machine.

## Owner authentication boundary

Normal Eve API access uses `MEMORY_API_TOKEN`. Owner-only routes require a GitHub OAuth access token that passes both checks in the Worker:

1. GitHub's OAuth application token-check endpoint must confirm that the token was issued to the configured `GITHUB_CLIENT_ID`, authenticated with `GITHUB_CLIENT_SECRET`.
2. GitHub's authenticated-user endpoint must return the configured immutable numeric `OWNER_GITHUB_ID`.

The Worker fails closed if any required binding is missing, invalid, or cannot be verified. The previous `TASK_OWNER_APPROVAL_TOKEN` fallback is not an owner-authentication path. The Next.js `/owner` console uses GitHub OAuth, stores the session token in an HttpOnly cookie, and proxies only allowlisted owner routes after checking the owner session. Owner OAuth credentials must be configured in Vercel Production and in the protected `cloudflare-production` GitHub Actions environment.

## Eve task tools

- `task_propose`: create an unapproved proposal; cannot approve or activate it.
- `task_list`: inspect recent tasks and approval state.
- `task_claim_next`: atomically claim one due approved task in Vercel Production only; Preview and local sessions return a no-op.
- `task_transition`: checkpoint, wait, pause, or finish the currently claimed task. It cannot approve, change scope, or resume a paused task.
- No task-approval or owner-control tool is exposed to Eve. The owner OAuth session credential is never placed in Eve's runtime.

## Isolation and limits

- Tasks are stored in their own SQL table; existing memory and experience rows are not migrated, rewritten, or deleted.
- Task proposals start unapproved; only owner-approved tasks can be claimed.
- One active task at a time, a bounded stale-run recovery lease, at most three attempts, and terminal states cannot be reopened.
- The Production work loop is not active until a Production deployment containing this change is explicitly approved. No external action, customer contact, purchase, payment, or Production deployment is enabled merely by this code change.
- Worker deployment is a separate, manually confirmed workflow. It must install the OAuth app credentials, immutable owner ID, Memory API token, and read-only Analytics token before publishing; post-deployment smoke tests must pass.

## Verification

The Cloudflare Workers Vitest suite exercises task lifecycle, owner-only approval, bounded single-task claiming, checkpoint persistence, OAuth app binding, immutable owner ID checks, and fail-closed behavior. Passing tests validate the isolated Worker runtime, not production deployment.
