# Eve neuron efficiency and recovery design

## Goal

Reduce Eve's local neuron accounting overhead, explain quota blocks accurately, and expose an owner-only read-only quota view while preserving the 7,000-neuron target and 3,000-neuron reserve.

## Assumptions

- The active model remains `@cf/zai-org/glm-4.7-flash`.
- Cloudflare's published per-model rates can support a conservative local estimate from provider-reported token counts; this is not exact per-request neuron telemetry.
- Missing or invalid usage must retain a conservative fallback.
- Existing historical local estimates must not be cleared or silently rewritten.
- No paid provider, plan upgrade, billing change, merge, or deployment is authorized.

## Approaches

1. Keep a fixed 1,200-neuron charge per call. Safest but wasteful: failed/short calls consume the same local budget as large successful calls.
2. Settle from provider-reported token usage using the model's published neuron rates plus a margin. This reduces overcounting while retaining a conservative fallback. **Selected.**
3. Replace the local ledger with a live account-level Analytics dependency. More complete, but requires separate secret provisioning and depends on sampled Analytics; not appropriate to make a prerequisite for the immediate correction.

## Implementation plan

- Use a 200-neuron temporary reservation for concurrency.
- Settle successful model calls using the model-specific estimate with a 50% margin; settle missing usage conservatively at 200.
- Keep the existing 7,000 local target and 3,000 reserve.
- Return distinct safe reason codes for local budget exhaustion and confirmed provider circuit exhaustion.
- Add an owner-authenticated read-only quota status endpoint and display its local-estimate limitations in the Owner Console.
- Document deterministic code as the preferred path for calculations, validation, formatting, and status checks. Explicitly state that a general zero-neuron task dispatcher is not yet implemented.

## Risks and dependencies

- Token-derived neuron values are estimates, not billing-grade actual usage.
- The local ledger does not include other Cloudflare account consumers.
- Provider error 4006 remains a hard stop; local code cannot bypass it.
- The current UTC day's historical fixed 1,200 charges are preserved.
- A general deterministic task dispatcher is future work and must not be claimed as available.

## Acceptance criteria

- Published GLM-4.7-Flash rates and 50% margin produce 192 neurons for 16,384 input tokens and 1,024 output tokens.
- Valid zero usage settles at zero; missing/invalid usage settles at 200.
- Worker tests prove 200-neuron reservation, estimated settlement, distinct 429 reason codes, and owner-only read-only status.
- Owner Console labels the displayed numbers as local estimates, not Cloudflare's live account meter.
- No memory records, owner approvals, task queue state, paid usage, or production resources are changed.
