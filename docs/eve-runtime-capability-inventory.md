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

## Creative artifact capability

Eve's `create_artifact` tool runs validated HTML/SVG, FluidSynth WAV, and FFmpeg MP4 jobs in a fresh network-isolated Vercel Sandbox using a prebuilt open-source renderer image. Finished files are stored in private Vercel Blob and returned with signed seven-day download links. This capability fails closed until the private Blob store, Vercel Sandbox OIDC, worker image, and link-signing environment are configured. Blender is installed but its declarative 3D adapter is not yet exposed. This is not a generative media-provider integration; do not claim Invideo or another ChatGPT-side connector is callable from Eve.
