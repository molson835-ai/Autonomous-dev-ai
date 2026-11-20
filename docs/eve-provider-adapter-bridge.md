# Eve Provider Adapter Bridge

## Current state

Eve has a provider-neutral execution planner for Vercel and Cloudflare. This bridge adds offline adapter descriptors and a readiness assessment. It does **not** create or control a sandbox.

Both providers remain candidates. Every adapter response carries `activationAllowed: false`. The injected provider client is validated for its future interface but is never called.

## Provider boundaries

### Vercel

The Vercel adapter is intended to run from Eve's Node.js/Vercel application boundary. Its descriptor reuses the deny-by-default isolated execution policy: ephemeral environment, no credentials, no network, no exposed ports, bounded timeout and resource settings.

The connected Vercel team was observed on Hobby. Vercel Hobby use is restricted to personal/non-commercial use. Since Eve's long-term purpose includes commercial revenue, Vercel Sandbox must not be activated for that workload unless the account is moved to a plan whose terms permit it and the owner separately approves any associated cost.

### Cloudflare

The Cloudflare adapter is a provider-neutral descriptor for a future Worker-side/ Durable Object-controlled container lifecycle. It specifies no inherited environment variables, no exposed ports, deny-all networking, no persistence, and bounded execution time. It does not call Cloudflare APIs or create a Container.

Cloudflare Sandboxes require Workers Paid. The connected account's subscription lookup returned HTTP 403, so its current plan remains unknown. Verify plan eligibility, current commercial terms, included usage, hard spend controls, and account limits before proposing activation.

## Readiness gate

`evaluateProviderReadiness` requires exactly five evidence categories:

- plan eligibility
- commercial-use eligibility
- usage limits
- billing and spending controls
- isolation controls

Each category must be verified, cite an HTTPS evidence reference, and have a timezone-aware timestamp no older than seven days. Explicit owner approval is required to reach `ready_for_separate_activation_review`. Even then, activation remains false. This is not permission to create resources or incur costs.

## What is still unavailable

- sandbox/container creation or deletion
- filesystem read/write or file transfer
- shell or command execution
- package installation
- network egress
- generated tool registration or execution
- provider failover or automatic selection
- production deployment, paid usage, or billing changes

These capabilities require separate, tested, owner-approved milestones. Network remains deny-all by default.

## Validation

The adapter contract tests use injected local client functions and assert they are not called. The readiness tests cover missing, false, malformed, stale, and complete evidence. No SDK dependency or provider API is introduced by this bridge.
