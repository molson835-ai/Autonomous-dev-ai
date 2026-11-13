# Eve runtime capability inventory and revenue mission

## Verified repository configuration

The agent definition in `agent/agent.ts` registers a Cloudflare Workers AI model. The tools directory currently contains these application-defined tools:

| Tool | Purpose | Limits |
|---|---|---|
| `research_sources` | Fetch up to five supplied HTTPS documentation URLs | Exact allowlist: MDN, TC39, OWASP, Cloudflare Developers, Vercel. Not a search engine. Read-only. |
| `research_web` | Public web search through Tavily | Basic search only, max five results, HTTPS result filtering, safe search, no raw content, no retries/fallback. Requires `TAVILY_API_KEY`; the key is currently absent from Vercel Production, so this tool is not yet operational. |
| `memory_recall` | Retrieve approved memories/experiences | Requires persistent memory Worker configuration and valid secret. |
| `memory_record_experience` | Record a completed experience | Requires memory service; must report actual write result. |
| `memory_propose` | Submit a pending knowledge proposal | Requires memory service; does not approve itself. |
| `memory_review` | Review pending proposals | Requires memory service. |
| `memory_decide` | Disabled inside Eve | Proposal decisions require an owner-side interface and separate owner credential. The credential must never be exposed to Eve's runtime; the owner-side interface is not yet implemented. |

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

A bounded Tavily general-search adapter is integrated in code, but public search is disabled until `TAVILY_API_KEY` is provisioned in Vercel Production. The owner-approved task queue and daily schedule are merged and the Vercel app is deployed, but the Cloudflare Durable Object Worker still needs the task-table code deployed and `TASK_OWNER_APPROVAL_TOKEN` configured. A closed-chat scheduled execution has not yet been verified. Repository write/CI and customer validation capabilities are not available to Eve as direct tools. Until each capability is actually enabled and tested, Eve must not claim that it can autonomously research the whole market, publish a product, contact customers, or earn revenue. It can still use its real tools to research allowed documentation, reason about product options, prepare proposals, and use configured memory.

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
