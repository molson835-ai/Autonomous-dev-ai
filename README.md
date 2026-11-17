## Owner authentication configuration

The owner console verifies the immutable numeric GitHub user ID, not a reusable login name. The memory Worker additionally verifies that a supplied OAuth access token belongs to the configured GitHub OAuth App before accepting it for owner-only routes. See [owner authentication setup](docs/owner-authentication.md) for required Vercel and Cloudflare configuration. Missing or mismatched configuration fails closed.

# Autonomous Dev AI

An Android-first software development agent intended to turn requests into researched plans and, in later permissioned milestones, tested software deliverables.

## Current milestone: read-only research engine

- [x] Establish the Eve-based TypeScript project foundation and Android-first chat.
- [x] Configure Cloudflare Workers AI as the model provider.
- [x] Add a read-only Eve research tool for approved public documentation hosts.
- [x] Enforce HTTPS host allowlisting, redirect revalidation, request timeout, response-size limits, and content-type checks.
- [x] Add automated retrieval-security tests.
- [x] Add calculator repeated-equals reference cases as the first learning/evaluation fixture.
- [x] Add a persistent memory foundation with experience records, approved recall, and owner-reviewed learning proposals.
- [x] Add a transparent revenue-opportunity evaluator with evidence confidence, cost/time weighting, risk scoring, and no-cost experiment recommendations.
- [x] Add evidence-backed capability benchmark reporting with per-domain pass rates, baseline comparisons, and regression detection.
- [ ] Verify the research tool in a live Eve session against current public documentation.
- [x] Add a separately reviewed free news-search discovery method using the keyless GDELT DOC 2.0 API; results are limited discovery leads and require independent verification.
- [ ] Add explicit review/promotion workflow for proposed knowledge records.

The research capability is read-only. It does not write to the repository, execute downloaded code, run shell commands, deploy, or automatically promote knowledge. Persistent memory is a separate opt-in subsystem and remains unavailable until its Worker is configured.

## Architecture

- Runtime: [Eve](https://github.com/vercel/eve), an open-source framework for durable agents, tools, and approvals.
- Language: TypeScript.
- Web interface: official Eve Web Chat scaffold using Next.js and React, located in `apps/web/`.
- Sessions: Eve client wiring with URL-addressed session routes under `/s/` and `/s/[sessionId]/`.
- Model provider: Cloudflare Workers AI direct API using `@cf/zai-org/glm-4.7-flash`.
- Research tools: `agent/tools/research_sources.ts` retrieves supplied approved documentation URLs; `agent/tools/search_news.ts` discovers limited recent news leads via the free GDELT DOC 2.0 API. Both are read-only and discovered by Eve from the filesystem.
- Research implementation: `agent/research/sources.ts`.
- Opportunity evaluator: `agent/research/opportunity-evaluator.ts`; Eve tool: `agent/tools/evaluate_opportunity.ts`; scoring policy and limitations: `docs/opportunity-evaluation.md`.
- Approved source hosts: `developer.mozilla.org`, `tc39.es`, `owasp.org`, `developers.cloudflare.com`, and `vercel.com`.
- Source retrieval: direct HTTPS GET only; every redirect is revalidated; maximum five unique URLs; 8-second request timeout; 120 KB response cap; HTML/plain-text extraction; 6,000-character excerpt cap. GDELT discovery uses one fixed HTTPS endpoint, bounded queries/results, an 8-second timeout, a 256 KB streaming response cap, and no automatic retries.
- Evidence handling: fetched text is untrusted reference material. The agent must cite final URLs, distinguish facts from inference, and surface uncertainty.
- Knowledge: proposed records live under `agent/knowledge/proposed/`; nothing is automatically trusted or promoted.
- Persistent memory: `memory/worker/` contains an authenticated Cloudflare Worker backed by a single-owner SQLite Durable Object; `agent/tools/memory_*.ts` exposes recall, experience recording, proposal review, and explicit approval/rejection.
- Memory is retrieval-based learning, not model-weight fine-tuning. It requires a separately configured Cloudflare Worker URL and shared secret; see `docs/persistent-memory-setup.md`.
- Costs: no paid APIs or new paid services are introduced. Existing Cloudflare Workers AI usage remains subject to the configured free-tier allowance; pause if the free quota is exhausted.

## Development commands

Install dependencies:

```bash
npm install
```

Run the web interface:

```bash
npm run dev:web
```

Build and verify:

```bash
npm run build
npm run typecheck
node --test tests/*.test.mjs tests/research/*.test.mjs
```

The repository CI runs the Eve build, TypeScript type-check, and Node test suite. A passing build or test suite does not prove live source retrieval or live model behavior; those require a separate runtime test.

## Opportunity evaluation limitations

- The score is a transparent heuristic, not a forecast or guarantee of revenue.
- Confidence is separate from score and depends on evidence strength and reference count; sources still require independent verification.
- Only zero-cost candidates can receive the `small_test` label. Any direct outreach, customer contact, publishing, payment acceptance, spending, or ordering requires explicit owner approval and must pass the financial-safety controls.
- The evaluator does not autonomously rewrite its rubric. Outcomes should be recorded as experiences and rubric changes proposed for review.

## Capability benchmarking limitations

- The reporter summarizes supplied results; it does not execute benchmarks.
- Passes must be supported by repeatable external assertions or identified human reviews, never agent confidence.
- Scores describe only the submitted test set and cannot establish general intelligence or superiority to frontier models.
- Baselines and version metadata should be retained to make changes reproducible.

## Research limitations

- GDELT provides limited news discovery, not comprehensive web search. The documentation retrieval tool still requires direct URLs supplied by the agent or user. GDELT results must be independently verified at the publisher.
- Only the exact approved hostnames are allowed. Redirects to any other host are rejected.
- Page content is extracted as text; the tool does not execute scripts, download linked assets, or parse arbitrary binary formats.
- Retrieval success is not factual verification. Claims still require source evaluation and, where possible, independent corroboration.
- Knowledge updates remain proposals until independently reviewed and explicitly approved.

## Financial and safety boundaries

**The user's personal funds and personal credit are permanently off limits.**

- EVE must earn and collect revenue before asking to spend; before revenue, use genuinely free resources only.
- EVE may independently research, build, test, and prepare marketing drafts. Direct customer contact, outreach, offer publication, selling, payment acceptance, purchases, and financial-account access require explicit owner approval.
- No personal cards, bank accounts, credit, subscriptions, borrowing, or indirect spending.
- No paid APIs or services, metered usage, or paid fallback before cleared EVE revenue and explicit owner approval for the exact expense.
- After revenue, EVE must reserve for refunds, taxes, fees, and liabilities, then request approval before every expense using only available cleared business revenue.
- Never treat projected revenue, unpaid invoices, pending balances, or restricted customer funds as spendable.
- If provider billing or free-tier limits cannot be verified, pause rather than risk a charge.
- The research tool has no repository-write, shell-execution, deployment, purchasing, financial-account, or payment capabilities.

See [EVE's earn-before-spend policy](docs/eve-earn-before-spend-policy.md) for the complete operating rules and approval requirements. Documentation is not proof of technical enforcement; paid-action controls still require implementation and runtime verification.

## License

MIT. See [LICENSE](LICENSE).
