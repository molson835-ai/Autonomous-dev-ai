# Eve Reliability and Product-Creation Capabilities — Revised Implementation Plan

Goal: Make Eve reliably complete useful work in her own chat: research, create real files, verify deliverables, preserve them, and report accurate evidence. Keep recurring infrastructure costs at zero and do not violate Vercel Hobby's non-commercial-use restriction.

## Findings from the current production build

- `agent/agent.ts` sets a session input limit of 16,384 new tokens (or 4,000 output tokens).
- Recent production Agent Runs show about 27,000 uncached input tokens in one run, usually one turn, and a seven-day summary of 24 runs with 0 completed and 11 failed. The latest known task run had pending activation and no trace. The 16,384-token limit is therefore a strong candidate for why sessions stop after a single response.
- `agent/instructions.md` is 28,301 characters. It contains extensive always-on policy and repeated procedures that should be moved into load-on-demand skills where safe.
- `agent/tools/` has custom research, memory, task, and benchmark tools, but no explicit opt-in wrappers for Eve's built-in `bash`, `read_file`, `write_file`, `edit_file`, or `web_search` tools.
- Current `research_web` depends on Tavily and is blocked by the current no-cost-plan restriction. `research_sources` only fetches URLs supplied by the model from an allowlist of technical documentation hosts; it is not general product-market search. `search_news` uses GDELT and is limited discovery, not general web search.
- The GitHub OAuth flow currently requests only `read:user`; production environment metadata shows GitHub OAuth client credentials but no repository-write token. ChatGPT's GitHub connector is not available inside Eve's runtime.
- Eve's default sandbox on Vercel selects Vercel Sandbox. Do not assume that it is free or commercially eligible. Vercel Hobby is restricted to personal, non-commercial use, so do not build the revenue workflow around Hobby Sandbox or silently incur paid usage.

## Non-negotiable constraints

- Zero new spend, paid services, plan upgrades, subscriptions, or quota upgrades without separate explicit owner approval.
- Do not deploy Production, merge PRs, publish offers, contact customers, accept payments, make purchases, or create financial commitments without separate explicit owner approval.
- Never expose credentials, environment variables, owner cookies, or private repository secrets to model context or generated code.
- All repository changes are made on a dedicated feature branch and reviewed in a pull request. Never write directly to the default branch.
- Report only verified capabilities. A file existing in the repo is not proof that Eve can call it; a tool call succeeding is not proof that the user received a downloadable artifact.
- Keep every action bounded, idempotent where possible, with path confinement, output limits, timeouts, and clear exit/error status.

## Phase 1 — Stop sessions from self-terminating

1. Add an evaluation case that sends a normal user request through a real production-like session and records the usage window before/after the first model call.
2. Reduce the always-on instruction prompt by moving detailed procedures into existing or new deferred skills. Preserve every safety boundary, approval rule, quota stop condition, and truthfulness requirement.
3. Review the 16,384-token session cap against observed real usage and the Cloudflare Workers AI free-neuron budget. Do not simply raise it without a quota-safe justification. Prefer reducing prompt overhead and compacting prior conversation first.
4. Add an eval asserting that a simple request can complete with a final answer and that a multi-step request can reach at least one tool call and a final answer within the documented budget.
5. Keep a durable checkpoint before pausing long tasks. Do not create duplicate tasks or bypass the existing owner approval flow.

## Phase 2 — Give Eve a zero-cost artifact workspace

1. Do not select Vercel Sandbox for the commercial product workflow unless the account's terms and cost eligibility are explicitly confirmed.
2. Evaluate the framework's `JustBashSandbox` as a no-container, pure-JavaScript workspace for text/file creation only. It cannot run native processes and does not provide network isolation; it is not a replacement for full build/test execution.
3. If suitable for Production under the app's hosting terms, expose only bounded `read_file`, `write_file`, and `edit_file` operations first. Keep shell execution disabled until its provider and command surface are safe.
4. Add an artifact-delivery path that returns verified file content or an authorized download reference in Eve chat. Verify that the mobile client actually renders/saves the file.
5. If JustBash is not suitable for the production hosting terms, use a GitHub-backed workspace instead of a paid sandbox.

## Phase 3 — GitHub-backed persistence and free CI

1. Use a narrowly scoped GitHub App or fine-grained token restricted to this repository, with only Contents read/write and Pull Requests read/write as needed. Do not broaden the existing sign-in scope silently.
2. The current OAuth app's `read:user` scope is insufficient for repository writes. Obtain separate explicit owner authorization for any new repository scope or credential. Store the credential only as a server-side encrypted secret; never read it into model context.
3. Add tools for branch creation, writing files to Eve-created feature branches, opening draft PRs, reading diffs, and checking CI for the exact head SHA.
4. Reuse GitHub Actions on pull requests for typecheck, tests, and builds. No Production deployment or merge.
5. Test a deliberately failing change to prove Eve reports a red check honestly; then test a passing disposable artifact.
6. Keep product artifacts in a dedicated repository folder and make a mobile-friendly link available from Eve chat.

## Phase 4 — Honest general research

1. Remove the assumption that Tavily is a usable free search provider. Do not retry or switch to a paid service when its quota is blocked.
2. Evaluate the framework's provider-managed `web_search` option against the actual Cloudflare Workers AI model and AI Gateway configuration before enabling it; some providers/search modes may incur usage.
3. Until a no-cost search path is verified, clearly distinguish GDELT news discovery, allowlisted URL retrieval, and general web search. Do not claim eBay sold-price or demand data without actual evidence.
4. Add an eBay product-research skill only after Eve has a verified research path. Require source URLs, dates, evidence strength, competition caveats, fees, and explicit uncertainty.

## Phase 5 — First end-to-end capability proof

Eve must, from her own chat and without assistant-side intervention:
1. Create a small, useful text-based artifact in a persistent, owner-controlled location.
2. Read it back and verify exact content.
3. Run an available deterministic validation or GitHub Actions CI check and report the actual result.
4. Deliver a link/file that opens on the owner's Android phone.
5. Recover correctly from a deliberate failed validation without claiming success.

Do not merge, deploy Production, publish, accept payments, contact customers, or spend money as part of this proof.

## Acceptance criteria

- Normal requests no longer terminate immediately because the fixed prompt alone exceeds the session usage limit.
- Eve can create, read back, validate, persist, and deliver a real file from her own chat.
- Code builds/tests run through a verified free CI path, not an unverified paid sandbox.
- Research claims are grounded in sources actually accessible to Eve.
- Every tool and capability is visible in Eve's real runtime and passes an end-to-end test.
- Owner approvals remain explicit, scoped, and separate for repository credentials, merges, Production changes, external actions, and spending.
