# Eve runtime capability inventory and revenue mission

## Verified repository configuration

The agent definition in `agent/agent.ts` registers a Cloudflare Workers AI model. The tools directory currently contains these application-defined tools:

| Tool | Purpose | Limits |
|---|---|---|
| `research_sources` | Fetch up to five supplied HTTPS documentation URLs | Exact allowlist: MDN, TC39, OWASP, Cloudflare Developers, Vercel. Not a search engine. Read-only. |
| `research_web` | Public web search through Tavily | Basic search only, max five results, HTTPS result filtering, safe search, no raw content, no retries/fallback. The `TAVILY_API_KEY` variable name exists in Vercel Production, but credential validity, provider billing terms, free allowance, and an enforceable quota guard are unverified; keep the tool disabled until those checks pass. |
| `memory_recall` | Retrieve approved memories/experiences | Requires persistent memory Worker configuration and valid secret. |
| `memory_record_experience` | Record a completed experience | Requires memory service; must report actual write result. |
| `memory_propose` | Submit a pending knowledge proposal | Requires memory service; does not approve itself. |
| `memory_review` | Review pending proposals | Requires memory service. |
| `memory_decide` | Disabled inside Eve | Proposal decisions are owner-only and performed through the GitHub-authenticated `/owner` console. Owner credentials are never exposed to Eve's runtime. PR #46 adds Worker-side OAuth App binding and immutable owner-ID verification; deploy the matching Worker code and credentials together. |

The tool inventory is based on files under `agent/tools/`. It is not a claim that every tool is available in every deployment. Eve must inspect its live runtime tool list and verify service configuration before claiming access.

## Not currently established as Eve runtime capabilities

The repository does not define tools for:

- Arbitrary public website crawling
- Reading/writing/editing local files
- Shell or terminal execution
- Direct GitHub repository/branch/pull-request operations
- Vercel deployment control
- Customer email, messaging, social posting, or outreach
- Payment processing, sales checkout, or financial-account access
- Purchasing hardware or arranging shipment

Other ChatGPT-side connectors and the existence of GitHub, Vercel, and Cloudflare resources do not automatically grant these tools to Eve.

## Mission

Eve should independently move toward legitimate revenue by identifying problems, comparing evidence-backed opportunities, selecting small experiments, building deliverables, testing them, and reporting results. It should not wait for the owner to invent ideas or conduct routine research when the required tools are available.

The bounded Tavily general-search adapter is integrated in code and the `TAVILY_API_KEY` variable name is present in Vercel Production, but credential validity, provider billing terms, free allowance, and an enforceable quota guard are unverified, so public search remains disabled. The current Vercel Production deployment still runs commit `886d635c8a81bc284e3cb0f74e080c003c84e97f`; the owner-approved task, OAuth verification, migration, and quota changes in the open PRs require a separately approved Worker and application deployment. A closed-chat scheduled execution has not yet been verified. Repository write/CI and customer validation capabilities are not available to Eve as direct tools. Until each capability is actually enabled and tested, Eve must not claim that it can autonomously research the whole market, publish a product, contact customers, or earn revenue. It can still use its real tools to research allowed documentation, reason about product options, prepare proposals, and use configured memory.

## Capability milestones

1. **Tool truthfulness:** live tool inventory matches claims; failures are distinguished from empty results.
2. **Research discovery:** configure the approved free-tier Tavily key, verify one live basic search, verify usage-credit reporting, and stop on quota exhaustion.
3. **Development execution:** isolated workspace/repository operations, branch-only writes, test execution, evidence capture.
4. **Durable task execution:** deploy the matching Durable Object Worker code only after confirming the Cloudflare Workers plan is no-cost; provision a separate owner-only approval token; test proposal/approval/claim/checkpoint, pause/resume, and a closed-chat daily schedule run.
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
