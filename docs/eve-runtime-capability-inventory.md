# Eve runtime capability inventory and revenue mission

## Verified repository configuration

The agent definition in `agent/agent.ts` registers a Cloudflare Workers AI model. The application-defined tools in `agent/tools/` include:

| Tool | Purpose | Limits and current verification |
|---|---|---|
| `research_sources` | Fetch up to five supplied HTTPS documentation URLs | Exact allowlist: MDN, TC39, OWASP, Cloudflare Developers, and Vercel. Not a search engine. Read-only. Live Eve invocation is not yet evidenced. |
| `research_web` | Public web search through Tavily | Basic search only, max five results, HTTPS result filtering, safe search, no raw content, no retries/fallback. Requires both `TAVILY_API_KEY` and `EVE_TAVILY_FREE_PLAN_VERIFIED=true`. A sensitive Production variable entry exists for the key, but its value was not inspected. The free-plan verification variable is absent from the Production environment inventory, so the code fails closed and makes no request. |
| `search_news` | Limited recent news discovery through GDELT DOC 2.0 | Keyless and read-only; at most 10 article leads per request. Not comprehensive web search. Verify important claims at the original publisher. Live Eve invocation is not yet evidenced. |
| `research_opportunity_evidence` | Combined bounded news-lead discovery and supplied public-page retrieval | Merged in PR #123 and included in the verified 2026-11-26 Vercel Production deployment. At most 3 sequential GDELT/Google News queries (15 deduplicated leads) plus 5 caller-supplied URLs from a separate exact HTTPS allowlist. No automatic crawling, link following, Tavily, credentials, paid providers, memory writes, or external actions. Retrieved excerpts are unverified evidence candidates; live Eve invocation is not yet evidenced. |
| `research_revenue_opportunity` | Bounded revenue-opportunity news discovery batch | Merged code in the current Production deployment: one to three sequential focused queries, at most five leads per query and fifteen deduplicated HTTPS leads per batch. Reuses GDELT and Google News RSS; no Tavily, credentials, page retrieval, memory write, or external action. Returns empty verified-fact and source-observation arrays by design. Live Eve invocation is not yet evidenced. |
| `discover_resources` | Search GitHub repositories, Hugging Face models, and npm packages | Current Production code: at most 3 results per selected catalog, 3 catalogs, one HTTPS request per catalog, 6-second timeout, no retries. Submits inert metadata to the existing `/v1/resources` quarantine. Licenses, commercial use, and costs default to unknown unless upstream metadata states a license. No downloads, installs, execution, or approval. Live invocation and Production persistence are not yet evidenced. |
| `skill_library` | List or load bundled skill guides | Read-only fixed-file allowlist. Catalog exposes categories, capability tags, prerequisites, and benchmark examples; filters by category/capability. Metadata is not evidence of demonstrated competence. |
| `plan_task_skills` | Match task requirements to skill evidence and resource metadata | Planning-only. Returns resource provenance and explicit review gaps; execution readiness is always false. It does not verify sources, run tests, install resources, or promote skills. |
| `memory_recall` | Retrieve approved memories/experiences | Production memory URL/token variable entries exist and owner diagnostic read endpoints returned HTTP 200. This does not prove the Eve tool works. Historical scheduled runs on Nov 18 and Nov 19 failed at `memory_recall`; traces omitted tool error content and used older Vercel commits. Current-deployment Eve success is not yet verified. |
| `memory_record_experience` | Record a completed experience | Production write/read-back test is deferred. Do not claim a record was saved until a separately approved exact-ID round trip succeeds. |
| `memory_propose` | Submit a pending knowledge proposal | Writes a pending proposal; does not approve itself. Production writes remain gated by owner approval. |
| `memory_review` | Review pending proposals | Requires the memory service. |
| `memory_decide` | Disabled inside Eve | Proposal decisions require an owner-side interface and separate owner credential. The credential must never be exposed to Eve's runtime. |
| `create_artifact` | Validate and persist a standalone HTML deliverable | Dynamically gated by canUseWriteTools; revalidated by the Worker; 64 KiB per source artifact, 20 items and 1 MiB aggregate storage maximum. Owner-only list/download/delete in the Owner Console. Persistence is not available until the matching Worker deployment. |
| `get_artifact` | Retrieve a stored HTML artifact by UUID | Read-only Worker endpoint using the existing shared service credential. Does not create, modify, or delete artifacts. Production invocation is not yet evidenced. |

The tool inventory is based on files under `agent/tools/`. It is not a claim that every tool is available in every deployment. Eve must inspect its live runtime tool list and verify service configuration before claiming access.

## Production deployment snapshot (2026-11-20 UTC)

- Vercel Production is READY on `main` at commit `db2e972c5426c781f3a7c7a7916acbe5c37e18c4`.
- Cloudflare memory/task/resource Worker version 44 is deployed at 100%.
- Owner memory diagnostic read endpoints returned HTTP 200. This confirms the diagnostic path, not successful Eve tool calls or writes.
- In the last three days, Agent Runs telemetry reported 11 runs: 3 failed, 8 waiting, and 0 completed. Reported run cost was $0. The waiting state alone does not prove a run is stuck.
- Two inspected scheduled failures (Nov 18 and Nov 19) completed `task_claim_next` and then failed at `memory_recall`. Trace content was omitted, so the exact error is unknown. Both used older Vercel commits, before the current Production deployment. A third scheduled failure had no recorded tool calls.
- The research task remains paused. Do not resume it, manually trigger Cron, or create tasks as part of a read-only audit.
- The production memory write/read-back test is explicitly deferred. No production test memory or resource records should be created without renewed owner approval.

## Not currently established as Eve runtime capabilities

The repository does not define tools for:

- Arbitrary public website crawling
- General repository filesystem access, local file writing/editing, or shell execution. A production trace did observe a sandbox-scoped `read_file` harness utility; it failed on `/workspace/package.json` because that path was absent. This does not establish that the repository is mounted. Eve must use only task-supplied or previously confirmed paths and must not guess workspace paths.
- Direct GitHub repository/branch/pull-request operations
- Vercel deployment control
- Customer email, messaging, social posting, or outreach
- Payment processing, sales checkout, or financial-account access
- Purchasing hardware or arranging shipment

Other ChatGPT-side connectors and the existence of GitHub, Vercel, and Cloudflare resources do not automatically grant these tools to Eve.

## Mission

Eve should independently move toward legitimate revenue by identifying problems, comparing evidence-backed opportunities, selecting small experiments, building deliverables, testing them, and reporting results. It should not wait for the owner to invent ideas or conduct routine research when the required tools are available.

Today, the repository contains a bounded Tavily general-search adapter, but it remains fail-closed until both its key and the explicit no-cost-plan verification setting are present. GDELT provides limited news discovery, not comprehensive market search. The approved-host documentation retriever requires direct URLs. The task/resource Durable Object Worker is deployed, but closed-chat scheduled execution and current-deployment memory tool success have not been demonstrated. Repository write/CI and customer validation capabilities are not available to Eve as direct tools. Until each capability is actually enabled and tested, Eve must not claim that it can autonomously research the whole market, publish a product, contact customers, or earn revenue.

## Capability milestones

1. **Tool truthfulness:** live tool inventory matches claims; failures are distinguished from empty results.
2. **Research discovery:** verify the no-cost Tavily plan and usage limits, set the explicit free-plan gate only after verification, then perform one owner-approved live basic search and account for returned usage credits. Stop on quota exhaustion.
3. **Development execution:** add an isolated workspace with narrowly scoped file/repository operations, branch-only writes, test execution, and evidence capture. Do not grant shell, deployment, or production-write authority by implication.
4. **Durable task execution:** verify the deployed Durable Object Worker, owner approval, claim/checkpoint, pause/resume, and a closed-chat daily schedule without manually triggering Cron.
5. **Market validation:** a user-approved channel for volunteer testing or outreach; no unsolicited contact.
6. **Revenue operations:** separately authorized business identity, public offer, payment provider, and revenue reconciliation. Each is a separate approval milestone.
7. **Hardware reinvestment:** measured bottleneck report and owner-approved purchase using cleared business revenue only.

## Operating metrics

Track separately:
- Opportunities researched and source quality
- Prototypes completed and test results
- User tests completed and false-positive/error rates
- Verified time saved or task success
- Stated willingness to pay (not counted as revenue)
- Cleared payments received (revenue)
- Actual business expenses and net cleared funds
- Hardware bottlenecks measured and proposed

Never count hypothetical prices, unpaid commitments, forecasts, or user interest as revenue.


## Capability roadmap review — 2026-11-23

The owner approved a capability-independence roadmap covering web research, coding, file processing, memory, document creation, images/media, scheduling, local inference, and discovery/use of lawful free resources.

The current main-branch code has moved beyond the older production snapshot above: PR #96 merged on 2026-11-23 (merge commit 97f5bb410ac56acb9ab990ee4a3a97d2b9cf38d2) and adds bounded GDELT timeout retry, Google News RSS fallback, and improved bounded documentation retrieval. This is a repository merge, not evidence of Production deployment. Refresh the Production snapshot from live telemetry before claiming current deployment status.

The following remain important blockers from the verified repository inventory:
- Tavily general search remains fail-closed until the owner verifies the current free plan and disables pay-as-you-go; do not set the human-attestation flag automatically.
- Eve's application still lacks direct GitHub branch/PR operations and a general local file workspace; ChatGPT's GitHub connector is not automatically an Eve runtime tool.
- Cloudflare memory diagnostics and the Eve memory_recall tool are separate paths. The scheduled failures noted in the historical snapshot must be re-tested against the current deployed commit before declaring memory healthy.
- The resource catalog is not an install queue. Every discovered item must be reviewed for license, commercial use, cost, privacy, security, freshness, and persistence before enabling it.
- Public free services and community compute must not be combined to evade quotas or access controls. Personal cloud accounts are not Eve's backend.

PR #97 merged the additive resource metadata contract, exact-host intake allowlist, resource planner gating, and ecosystem catalog. The next slice adds a bounded keyless discovery adapter for GitHub, Hugging Face, and npm; it writes only to the existing quarantined resource registry. Follow with browser-local CSV/JSON processing. Keep each slice isolated, testable, and non-production until separately reviewed.


### Existing resource registry baseline correction

A repository inspection on 2026-11-23 confirmed that resource intake and owner review already exist:
- agent/resources/intake.mjs validates a narrow HTTPS host allowlist and creates inert metadata with trust_state=quarantined.
- The Cloudflare Durable Object stores resource rows and exposes owner-authenticated listing and decision routes.
- agent/tools/plan_task_skills.ts can consume resource metadata supplied to it.
- No verified general-purpose Eve resource-discovery/proposal tool was found in the inspected runtime inventory.

Do not build a second resource registry. Extend the current schema and intake with additive capability, access, persistence, data-classification, commercial-use, quota, and adapter-state fields. Keep arbitrary domains blocked, imported resources inert, and owner decisions owner-only. The new catalog is a discovery map, not evidence that any candidate has been activated.


## Keyless resource discovery adapter — implementation branch

Branch `feat/keyless-resource-discovery` adds a proposed Eve tool, `discover_resources`, backed by public catalog endpoints:
- GitHub repository search (`api.github.com`)
- Hugging Face model catalog (`huggingface.co`)
- npm package registry search (`registry.npmjs.org`)

The adapter is bounded to 1–3 results per selected catalog (maximum 9), one HTTPS request per catalog, a 6-second timeout, no retries, no API keys, and no downloads. It submits only compact inert metadata to the existing authenticated `POST /v1/resources` route, which stores candidates in quarantine. Upstream text is untrusted. License, cost, commercial rights, quota, and persistence remain unknown unless explicitly sourced; a discovered license string is not treated as commercial approval.

**Verification boundary:** automated tests and CI can verify parsing, bounds, error handling, and quarantine submission contracts. A successful build does not prove the live Eve runtime discovers this tool or that the Production Worker accepts writes. Those require a separately authorized, controlled runtime test. Do not enable the Tavily adapter or change Production configuration as part of this work.


## Framework default-tool surface hardening — draft PR

The draft branch `security/disable-framework-default-tools` changes the root `agent/agent.ts` configuration to set `defaultTools: false` and `tool: false`.

- `defaultTools: false` disables Eve's optional framework default tools while preserving authored tools under `agent/tools/` and required connection discovery tooling.
- `tool: false` disables the root agent's model-facing root-copy delegation tool.
- This is intended to remove the framework-provided generic shell, filesystem, web-fetch/search, and delegation surface seen in the previous Production inventory.
- Application-authored tools remain and still require their own code-level security review. This setting does not disable or certify them.
- The repository has no authored `agent/sandbox.ts` or `agent/sandbox/` provider configuration. Do not claim that the existing shared sandbox has a project-specific network, credential, persistence, or workspace policy.
- The six discovery warnings remain unresolved because the current Owner Console exposes only the count. A later diagnostic improvement must return sanitized warning codes and source paths from the compiled Agent Info data.

**Deployment verification required:** after a separately approved deployment, inspect the Production inventory and confirm that framework defaults are absent while intended authored tools remain. No runtime change is implied by this draft branch.


## Structured skill and resource catalog update — 2026-11-26

The current development branch adds structured metadata to the seven bundled skill guides:
- Category, capability tags, prerequisites, and objective benchmark examples.
- Exact category/capability filtering without loading unrelated guide files.
- Loading one guide still uses the fixed bundled-file allowlist and the 8,000-character maximum.

The task-to-skill planner now returns the resource's provenance, revision, maintainer, license, cost notes, dependencies, permissions, security notes, freshness policy, quota evidence, and lifecycle fields. It explicitly lists missing review evidence. A resource is never marked execution-ready by this planner. Review completeness requires owner approval, a known open-source cost model, explicit commercial-use permission, dated high-confidence quota evidence, and complete access/persistence/execution/security/lifecycle metadata.

The test command now includes `tests/planning/*.test.mjs`; previously the nested planner suite was not included by the package test script. No Worker schema, endpoint, binding, secret, or deployment is changed by this catalog slice.


## Designated eBay project write capability — implementation branch

The branch `feat/eve-ebay-project-write-tool` adds the proposed `ebay_project_write` tool. It is limited in code to:
- Repository `molson835-ai/Autonomous-dev-AI`
- Branch prefix `eve/ebay-inventory-audit/`
- File path prefix `products/ebay-inventory-audit/`
- Small regular text files with an explicit extension allowlist and 64 KiB per-file cap
- Exact expected-base/head SHA checks and non-force Git ref updates
- Draft pull requests to `main` only after a bounded compare verifies every changed path is inside the product directory

The tool is dynamically gated by the existing stateful-tool authorization policy. It cannot write `main`, delete files, force-push, merge, deploy, run shell commands, or change other repository paths. The PAT is read only from the environment variable `EVE_GITHUB_REPO_TOKEN`; no token has been connected to Vercel at this stage. The PAT itself remains repository-wide, so the path and branch boundary is enforced by Eve's tool code rather than by GitHub token permissions. See `docs/eve-ebay-project-write-access.md`.

**Verification boundary:** this branch is implementation code, not a live capability grant. A green CI run is required before merge. Merge and Production deployment still need separate owner approval. Adding the PAT as a Vercel secret and performing a bounded live acceptance test are separate owner-controlled steps. Until those steps are completed, Eve must not claim it can write to GitHub.
