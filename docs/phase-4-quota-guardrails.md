# Phase 4 — neuron efficiency, quota recovery, and deterministic work

## Goal

Keep Eve productive within the existing no-cost Workers AI allowance by charging a model-specific estimate instead of a fixed 1,200-neuron amount for every call, making quota blockers diagnosable, and avoiding model calls for deterministic work.

## Current limits and evidence

- Cloudflare's published Workers AI free allocation is 10,000 neurons per UTC day. Eve's local safety target is 7,000, retaining a 3,000-neuron buffer.
- Eve uses `@cf/zai-org/glm-4.7-flash`.
- Cloudflare publishes 5,500 neurons per million input tokens and 36,400 neurons per million output tokens for this model.
- Provider-reported token usage is not itself neuron telemetry. Eve converts it to a **local estimate** using the published model rates plus a 50% safety margin.
- The current runtime's local ledger is not an authoritative account-wide Cloudflare meter. Owner Console must label it accordingly.

## Reservation and settlement

- New model calls temporarily reserve 200 neurons to coordinate concurrent calls. The Worker also accepts the legacy 1,200-neuron request and settlement format during a Worker-first rollout; legacy calls continue to be charged the full 1,200.
- On successful generation or stream completion, middleware settles the estimate derived from provider-reported input/output token usage.
- Valid low usage is not floored to 200. Missing or invalid usage settles conservatively at 200.
- Interrupted streams settle conservatively at 200 rather than leaving the reservation stranded.
- Provider error 4006 opens the daily circuit and is never retried or sent to another provider.
- The local 7,000-neuron safety-target response may use the separately approved Gemini free-tier fallback only when its explicit enable flag, API key, and no-billing-account attestation are all present. Provider quota circuits and telemetry failures never use this fallback.
- Local-budget and provider-circuit HTTP 429 responses have distinct safe reason codes.

## Diagnostics

- `GET /v1/owner/quota/status` is owner-authenticated and read-only.
- The response reports the UTC day, local estimated usage, active reservations, projected usage, remaining headroom to 7,000, and circuit state.
- It explicitly identifies its source as `local_model_estimate_not_provider_telemetry`.
- The endpoint does not reset, clear, or rewrite the ledger.
- Quota errors expose only a small allowlist of reason codes; raw Worker response text is not passed into Eve's prompt or UI.
- Model middleware reservation failures now include a safe low-cardinality error name, endpoint category, and allowlisted reason code in runtime error telemetry. Unknown response bodies, URLs, credentials, and task content are never copied into the diagnostic.
- This distinction is important because a scheduled run may successfully complete one model/tool step and fail before its next model call when the next reservation is rejected.

## Reduce model calls

- Batch related tool operations when possible.
- Reuse cached results and compact summaries.
- Retrieve only the exact memory needed for the current task.
- Use deterministic code for calculations, validation, formatting, status checks, and predictable workflow steps.
- Do not retry provider quota failures, switch providers after Cloudflare error 4006, or use a paid fallback. The only exception is the exact local safety-target response, which may use the separately documented, owner-approved Gemini free-tier fallback when all opt-in and no-billing conditions are met.

## Zero-neuron operating mode: current boundary

Some deterministic operations can run without Workers AI when a non-model code path invokes them. The existing runtime does **not** yet have a general-purpose deterministic task dispatcher that can independently execute arbitrary owner-approved tasks after model inference is blocked. Do not claim that broad autonomous work continues at zero neurons until that dispatcher exists and is tested.

A future deterministic dispatcher must use an explicit allowlist of operations, preserve owner approval and task scope, write checkpoints, and reject any operation requiring model reasoning or external side effects.

## Risks and dependencies

- The model-specific neuron conversion is an estimate with a safety margin, not a billing-grade per-request measurement.
- The local ledger cannot account for other Workers AI consumers in the Cloudflare account. The 3,000-neuron buffer reduces risk but is not a guarantee against external usage.
- If Cloudflare rejects a request with daily quota error 4006, local accounting cannot override that provider restriction.
- Historical fixed 1,200-neuron settlements remain in the current UTC day's local ledger. New calls use the smaller reservation and actual-usage estimate; no ledger reset or bypass is performed.
- No paid model, plan upgrade, billing change, Production deployment, or Worker deployment is authorized by this change. Gemini fallback details and required owner setup are documented in `docs/gemini-free-tier-fallback.md`.

## Acceptance criteria

- A typical 16,384-input-token / 1,024-output-token call estimates 192 neurons with the published rates and 50% margin.
- A valid 0-token usage report settles at 0; missing/invalid usage settles at 200.
- The Worker accepts only its fixed 200-neuron reservation request and validates settlement values.
- A local 7,000-neuron target block returns `local_neuron_budget_reached`; provider circuit block returns `quota_circuit_open`.
- Owner quota status is authenticated, read-only, and labels local estimates accurately.
- Deterministic status/validation/formatting paths are documented as zero-neuron candidates, without claiming a general dispatcher exists.
- Existing approval, spending, memory, and no-paid-fallback boundaries remain unchanged.
