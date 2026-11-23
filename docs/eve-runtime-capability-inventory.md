# Eve runtime capability inventory and revenue mission

## Verified repository configuration

The agent definition in `agent/agent.ts` registers a Cloudflare Workers AI model. The application-defined tools in `agent/tools/` include:

| Tool | Purpose | Limits and current verification |
|---|---|---|
| `research_sources` | Fetch up to five supplied HTTPS documentation URLs | Exact allowlist: MDN, TC39, OWASP, Cloudflare Developers, and Vercel. Not a search engine. Read-only. Live Eve invocation is not yet evidenced. |
| `research_web` | Public web search through Tavily | Basic search only, max five results, HTTPS result filtering, safe search, no raw content, no retries/fallback. Requires both `TAVILY_API_KEY` and `EVE_TAVILY_FREE_PLAN_VERIFIED=true`. A sensitive Production variable entry exists for the key, but its value was not inspected. The free-plan verification variable is absent from the Production environment inventory, so the code fails closed and makes no request. |
| `search_news` | Limited recent news discovery through GDELT DOC 2.0 | Keyless and read-only; at most 10 article leads per request. Not comprehensive web search. Verify important claims at the original publisher. Live Eve invocation is not yet evidenced. |
| `memory_recall` | Retrieve approved memories/experiences | Production memory URL/token variable entries exist and owner diagnostic read endpoints returned HTTP 200. This does not prove the Eve tool works. Historical scheduled runs on Nov 18 and Nov 19 failed at `memory_recall`; traces omitted tool error content and used older Vercel commits. Current-deployment Eve success is not yet verified. |
| `memory_record_experience` | Record a completed experience | Production write/read-back test is deferred. Do not claim a record was saved until a separately approved exact-ID round trip succeeds. |
| `memory_propose` | Submit a pending knowledge proposal | Writes a pending proposal; does not approve itself. Production writes remain gated by owner approval. |
| `memory_review` | Review pending proposals | Requires the memory service. |
| `memory_decide` | Disabled inside Eve | Proposal decisions require an owner-side interface and separate owner credential. The credential must never be exposed to Eve's runtime. |

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

The next implementation slice is intentionally small: a typed resource-registry contract and documentation-backed catalog, followed by one keyless public discovery adapter and browser-local CSV/JSON processing. Keep each slice isolated, testable, and non-production until separately reviewed.
