# Eve provider-portable execution controls

## Scope and current state

This milestone defines a provider-neutral contract for two candidate providers: Vercel Sandbox and Cloudflare Containers/Sandbox. Both are represented in code, but neither adapter connects to an SDK, creates a container/VM, invokes a command, or reads provider billing. Every plan returns `planned_not_executed`; provider activation is hard-disabled.

## Provider contract

A future adapter must implement the same lifecycle contract: validate request; create an ephemeral isolated runtime; transfer only bounded task inputs; run a fixed reviewed profile with a fixed argument vector; capture bounded outputs and resource usage; stop/clean up; return a normalized result. Provider-specific SDK calls belong behind adapters and must not leak into task planning or checkpoint formats.

Vercel candidate requirements: Firecracker isolation, explicit deny-all egress, non-persistent runtime, no environment secrets, no exposed ports, strict timeout and cleanup. Cloudflare candidate requirements: isolated container/runtime, explicit outbound network denial (including global outbound), no production bindings/secrets, strict resource limits and cleanup. The exact supported controls and plan eligibility must be verified against the selected account and current provider docs before implementation.

## Timeout profiles

- `node-test-pure-js`: 30 seconds default.
- `bounded-analysis`: 45 seconds default.
- Application hard cap: 60 seconds.
- Input/output caps are profile-specific.
- These are policy profiles, not evidence of provider-enforced limits. Provider adapters must verify effective enforcement before execution is enabled.

## Usage and budget controls

The usage evaluator accepts provider-reported CPU, memory, creation and spend pairs, and only assesses them when the source is explicitly marked verified. It uses the highest reported utilization ratio:
- 50%: observe.
- 75%: warn.
- 90%: stop optional work.
- 100%: stop all new provider work.

Missing, malformed, incomplete, or unverified usage fails closed. This is not a billing integration and does not infer actual charges. A future provider connector must record source, period, currency, retrieval timestamp, and provider account identity, then reconcile estimates against invoices. Per-task hard limits and a monthly spend ceiling must be configured before activation. No paid fallback, plan upgrade, or billing change is allowed implicitly.

## Checkpoint contract

Checkpoints are portable data-only objects with task ID, checkpoint ID, monotonically increasing sequence, status, provider, profile, timestamp and bounded payload. Payloads are limited to 32 KiB and credential-like field names/content are rejected. Validation does not persist or resume work. Resume eligibility requires the same task and sequence, paused state, and explicit owner approval. A provider change must preserve task identity and checkpoint sequence; a checkpoint is not proof that the prior provider completed any unrecorded side effect.

## Safety and non-goals

- No SDK dependencies, provider API calls, container creation, file transfer, shell, package install, network access, or generated code execution.
- No secrets in provider runtimes or checkpoints.
- No automatic paid fallback or automatic provider switching.
- No automatic task resume; owner approval required.
- No production memory writes, repository writes, PR merge, deployment, outreach, payments or purchases.
- Production and Worker deployment remain separate owner approvals.
- Current task queue remains untouched.

## Before activation

1. Verify current plan eligibility and commercial-use terms for both providers.
2. Verify free allowances, metering units, overage rates, billing alerts and hard spend controls.
3. Implement each adapter behind an owner-only feature flag, initially with no credentials or outbound network.
4. Test isolation, egress denial, secret non-inheritance, timeout, output caps, cleanup, concurrency, retries, provider outages and quota exhaustion.
5. Reconcile provider usage reports with billing data and prove stop behavior at thresholds.
6. Test checkpoint integrity, replay/idempotency and owner-approved resume across providers.
7. Obtain explicit approval for any runtime activation, account change, paid usage, deployment or execution permission.

All current functions are deterministic policy validators. They do not confer new runtime capabilities.
