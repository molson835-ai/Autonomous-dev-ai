# Provider Adapter Bridge v1 — Design

## Intent

Prepare Eve to use either Vercel Sandbox or Cloudflare Sandboxes through one provider-neutral lifecycle boundary, while keeping both providers inactive until account eligibility, cost controls, and security enforcement are verified. This preserves the previously selected two-provider direction without creating billable resources or granting Eve execution capabilities now.

## Goals

- Define one narrow adapter contract for requesting and stopping an ephemeral sandbox.
- Keep Vercel and Cloudflare implementations behind injected provider clients so unit tests make no network or provider calls.
- Require deny-all outbound networking, ephemeral storage, no inherited secrets, bounded timeout/resources, and no exposed ports in every proposed configuration.
- Make provider activation impossible in this milestone; return only a readiness assessment.
- Keep provider-specific runtime wiring separate: Vercel runs in Eve's Node environment; Cloudflare sandbox lifecycle is controlled by a Cloudflare Worker/ Durable Object boundary.
- Preserve auditability and fail closed when provider plan, commercial eligibility, usage, billing controls, or isolation evidence is missing.

## Non-goals

- No SDK dependency installation or live provider API calls.
- No sandbox/container creation, file transfer, shell/command execution, package installation, network egress, exposed ports, or generated-tool execution.
- No Worker deployment, Vercel deployment, plan upgrade, billing change, paid usage, secrets, task/queue mutation, or production memory write.
- No provider failover or automatic selection.

## Approaches considered

1. **Direct SDK integration now.** Rejected for this milestone: the connected Vercel team is Hobby, whose terms restrict use to personal/non-commercial purposes; Cloudflare Sandboxes require Workers Paid, and the connected account's subscription endpoint could not be read (HTTP 403). Direct integration would create an activation path before eligibility and spending controls are verified.
2. **Provider-neutral injected adapters with hard-disabled activation.** Recommended. It creates a testable seam for both providers, allows offline conformance tests, and adds no SDK/network/runtime capability. Provider SDKs can be wired in a later, separately approved milestone.
3. **Vercel-only integration.** Rejected because it contradicts the selected two-provider direction and does not resolve Vercel Hobby's commercial-use restriction.

## Constraints and current evidence

- Vercel team plan observed through the connected Vercel account: `hobby`.
- Vercel Hobby is limited to personal/non-commercial use; Eve's intended revenue activity means Vercel Sandbox must remain unavailable for commercial production under the current plan.
- Cloudflare Sandboxes are available on Workers Paid; published pricing states a $5/month minimum Workers Paid plan with included usage. The connected Cloudflare subscription lookup returned HTTP 403, so the account's current plan is unknown.
- No plan upgrade, spend-policy change, or paid usage is authorized.
- PR #71's provider policy remains the source for bounded profiles and usage/checkpoint limits; this milestone must not weaken it.

## Proposed contract

A provider adapter accepts a validated, bounded request and a provider client supplied by the caller. Its lifecycle methods may only produce a configuration/request description and a normalized non-executed result in this milestone. Missing clients, readiness evidence, or owner approval fail closed. A readiness result may become `ready_for_separate_activation_review`, but `activationAllowed` remains false unconditionally.

## Acceptance criteria

- Both provider adapters are represented and conform to the same lifecycle contract.
- Tests use local injected fakes and assert exact provider options; no external network is used.
- Missing or unverified plan, commercial-use, usage-limit, billing-control, or isolation evidence blocks readiness.
- Provider errors and cleanup errors normalize safely and never trigger fallback.
- No code path creates a sandbox or invokes a provider SDK.
- Existing build, type-check, and safety tests remain green.

## Later stages

After this bridge is reviewed and merged, separately verify provider plan eligibility and hard spend controls. Only then propose real SDK wiring and live sandbox creation. Filesystem access, command execution, package installation, allowlisted networking, and automatic tool execution remain separate permissioned milestones.
