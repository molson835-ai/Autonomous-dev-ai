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
