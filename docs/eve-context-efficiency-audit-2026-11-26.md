# Eve context-efficiency audit — 2026-11-26

## Scope

Read-only inspection followed by a documentation-only cleanup on branch `chore/eve-context-efficiency-audit`. No runtime code, tool registration, quota ledger, neuron guard, session limit, Worker, Vercel setting, task queue, or Production deployment was changed.

## Findings from main before this branch

- `agent/instructions.md` contained 33,162 characters and approximately 4,690 whitespace-delimited words.
- The file included stale capability claims: it said Eve had no GitHub tools and prohibited repository writes, despite the subsequently added `ebay_project_write` capability.
- The old first-milestone section repeated a no-write/no-execution boundary that no longer accurately described the bounded eBay project tool.
- Revenue mission and owner-approved revenue-development sections repeated detailed policy already maintained in `agent/skills/revenue-mission.md`.
- `agent/lib/skill-library.mjs` uses a fixed allowlist and loads one selected guide on demand, with a maximum of 8,000 characters. `agent/tools/memory_recall.ts` supports keyword recall or exact experience lookup, with a default limit of 8 and maximum of 20.
- `agent/agent.ts` configures a 131,072-token per-call context window and a 400,000 uncached-input-token session ceiling. The source comment says a fresh first turn had recorded 71,883 uncached input tokens and that the session ceiling was raised to allow bounded tool turns and task closeout.
- `agent/lib/resource-budget.mjs` defines a separate 4,000-token per-turn policy default, but inspection of that module alone does not prove it is wired into the model/session limiter. The model session limiter is visibly configured in `agent/agent.ts`. This distinction should be resolved by a dedicated runtime integration review, not by assuming the smaller policy is enforced.
- The Owner Console's per-call history reports provider-reported input/output token counts and local neuron estimates. It labels the estimates as local and not provider neuron telemetry.

## Changes on this branch

1. Corrected the capability-truthfulness section. It now describes the bounded `ebay_project_write` tool accurately and distinguishes it from general repository, shell, merge, and deployment access.
2. Replaced the obsolete first-milestone capability section with the current narrow development boundary and explicit limits.
3. Added context-hygiene instructions: retrieve only relevant skills/memories, carry forward concise evidence-backed checkpoints, avoid repeating large tool outputs, and preserve all owner/security/financial boundaries.
4. Consolidated repeated revenue-policy sections into a short pointer to the canonical `agent/skills/revenue-mission.md` guide, retaining the essential approval and financial prohibitions in the core instructions.

## Measured documentation change

- Before: 33,162 characters; approximately 4,690 words.
- After: 31,995 characters; approximately 4,531 words.
- Reduction: 1,167 characters and approximately 159 words (about 3.5% of the original word count).

This is a modest documentation reduction, not proof of a corresponding token or neuron saving. Actual prompt serialization, caching, and repeated-context behavior have not yet been measured.

## Important unresolved work

- Capture a safe, redacted breakdown of the actual model request by component (system instructions, task prompt, conversation history, recalled memory, skill content, and tool results), without recording secrets or sensitive user data.
- Determine whether the 71,883 uncached-input figure was a single request or a session-window measurement and inspect the corresponding run's prompt composition.
- Verify which resource-budget checks are called in the actual task loop and whether `maxTokensPerTurn` is enforced independently of the session limiter.
- Measure cache-read and uncached input across comparable turns before/after any runtime optimization.
- Consider structured rolling checkpoints and bounded memory/skill retrieval only after the measurements identify the dominant repeated payload.

## Verification and safety

- Source inspection was performed against the repository's current main files before editing.
- No local test runner or repository checkout was available through the connected GitHub operations used for this change. CI has not been run on this branch.
- No model call, Eve task, memory write, quota reset, quota adjustment, guard change, paid service, Worker deployment, Production deployment, merge, or customer-facing action was performed.
- Do not claim that token usage or neuron consumption has been reduced until comparable provider-usage records demonstrate it.


## Production telemetry investigation — 2026-11-27

### Seven-day Agent Runs sample

Read-only Vercel Agent Runs telemetry returned 71 production runs for the seven-day window (first page contained all 71 in this query). Of these, 54 had token usage records:

- 54/54 usage-bearing runs reported zero cached input tokens.
- Total reported input across those 54 runs: 3,741,129 tokens.
- Mean input per usage-bearing run: approximately 69,280 tokens; median: 66,161.
- 32/54 runs were at least 50,000 input tokens; 9/54 were at least 100,000.
- Run status counts in the returned window: 48 waiting, 23 failed, 0 completed.

These are Agent Runs telemetry figures, not Cloudflare neuron telemetry. The zero cached-input field means the observability records did not report cached input for these runs; it does not identify which prompt component caused the usage.

### Inspected traces

1. The run with the exact 71,883 input-token measurement is `wrun_41M8393RH80GHR8K7JYB9WSTCK` (2026-11-23 04:02 UTC). Its trace currently returns `trace: null` with `pendingActivation: true`; therefore its prompt composition and per-turn breakdown are unavailable. Do not present its system prompt, conversation history, or tool outputs as identified causes.
2. Run `wrun_41M8DE917T0GKBH8WJG00TA4QY` (2026-11-27) has two completed turns with 112,792 and 180,836 input tokens respectively, total 293,628. Each turn made three successful `repository_readonly` calls. Both turns reported zero cached input. The trace has `contentOmitted: true` and empty message arrays, so it exposes turn/tool timing and usage but not the prompt/message content.
3. Run `wrun_41M87VCP6T0GSCYRBPT2GWQAVQ` (2026-11-24) has seven turns and 254,535 input tokens. Per-turn input ranged from 18,931 to 63,470 tokens; every reported turn had zero cached input. Its trace likewise has `contentOmitted: true`. Tool activity included runtime diagnostics, memory recall/experience recording, task listing, and research. This supports high repeated per-turn input but does not prove which content dominates it.

### Source-level findings

- `apps/web/app/_components/agent-chat.tsx` submits only the new user text through `agent.send(text, options)`; it does not manually concatenate the full conversation in this component. The Eve session framework manages session continuation.
- `docs/read-only-runtime-diagnostics.md` and `agent/tools/runtime_diagnostics.ts` explicitly document that `ctx.messages` is the model input for the current step and can include conversation history.
- The Agent Runs trace API currently omits message content (`contentOmitted: true`) for the inspected traces. It does not expose a per-component token breakdown.
- `agent/agent.ts` has a 131,072-token per-call context window and a 400,000 uncached-input session ceiling. This is a ceiling, not evidence of normal prompt size.
- `agent/lib/resource-budget.mjs` defines a 4,000-token per-turn limit, but the inspected `agent/agent.ts` session limiter does not call `evaluateResourceBudget`. A repository search/source inspection is still needed to determine whether a separate task runner invokes it. It must not be assumed to enforce the model request cap.

### Updated diagnosis

There is now strong evidence that high input-token consumption is repeated across turns and that caching is not reducing the recorded input in this sample. There is not enough telemetry to attribute the tokens to any one of: base instructions, conversation history, task prompt, retrieved memories, skill text, tool schemas, or tool results.

The exact 71,883-token run cannot currently be decomposed because its trace is pending activation. The later high-usage traces omit message content. Therefore a definitive prompt-component attribution requires new, privacy-safe instrumentation in a future separately reviewed change.

### Next narrowly scoped engineering proposal

Add opt-in, privacy-safe prompt-size instrumentation at the model boundary, without logging prompt text, tool arguments, secrets, memory content, or user data. Record only:
- total input tokens and cache-read tokens already returned by provider usage;
- stable component byte/character counts before serialization for system instructions, user/task messages, prior conversation, memory/skill retrieval, and tool results, if the framework exposes these components separately;
- per-component estimates clearly labeled as estimates, not tokenizer-verified token counts;
- deployment commit, run/turn identifiers, and model identifier.

First verify the framework exposes these components before implementing. If it does not, instrument only the safe aggregate fields that are actually available and document the limitation. Do not add raw prompt capture. Add tests proving that instrumentation excludes content and secrets. Keep all quota/session ceilings and the neuron guard unchanged. Do not invoke Eve to generate a baseline while the local quota guard is paused.

This proposal is not implemented. No runtime code or production telemetry configuration was changed.

## Privacy-safe model-boundary instrumentation implementation

Implemented on isolated branch `feat/privacy-safe-model-usage-instrumentation` after owner authorization; not merged or deployed.

- Extended the existing model-input profile with character-count aggregates by message role: system, developer, user, assistant, tool-result, and other.
- Added normalized numeric provider-usage fields for total input/output tokens, cache-read input tokens, cache-write input tokens, uncached input tokens, and reasoning output tokens where the installed AI SDK/provider exposes them.
- Missing cache/usage fields remain `null`; they are never silently treated as zero. A separate boolean indicates whether any cache metric was actually reported.
- Logs contain only model/environment identifiers and numeric aggregate measurements. No prompt text, message bodies, tool arguments, tool descriptions, schemas, secrets, or memory contents are logged.
- Added tests for role aggregation, redaction, alternate SDK usage shapes, and missing metadata.
- The existing quota reservation, settlement calculation, neuron target, reserve, session caps, Worker, and runtime behavior are unchanged. The new fields are observational only and are not used to calculate or settle neurons.
- The AI SDK/provider may omit cache details; the instrumentation reports that absence rather than inferring cache behavior. Provider usage values are still provider-reported token metrics, not Cloudflare neuron telemetry.
- Tests have been authored but have not yet been executed in a repository CI run. No PR, merge, Production deployment, or Eve model call was performed.
