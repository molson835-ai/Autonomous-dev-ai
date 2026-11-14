# Eve runtime capability inventory and revenue mission

## Verified repository configuration

The agent definition in `agent/agent.ts` registers a Cloudflare Workers AI model. The tools directory currently contains these application-defined tools:

| Tool | Purpose | Limits |
|---|---|---|
| `research_sources` | Fetch up to five supplied HTTPS documentation URLs | Exact allowlist: MDN, TC39, OWASP, Cloudflare Developers, Vercel. Not a search engine. Read-only. |
| `research_web` | Public web search through Tavily | Basic search only, max five results, HTTPS result filtering, safe search, no raw content, no retries/fallback. Production env metadata confirms the key is configured; Agent Runs shows successful invocations. |
| `memory_recall` | Retrieve approved memories/experiences | A recent Production call returned HTTP 401 despite Production env metadata showing memory variables. Treat as blocked until a safe recall succeeds. |
| `memory_record_experience` | Record a completed experience | Requires memory service; must report actual write result. |
| `memory_propose` | Submit a pending knowledge proposal | Requires memory service; does not approve itself. |
| `memory_review` | Review pending proposals | Requires memory service. |
| `memory_decide` | Disabled inside Eve | Proposal decisions require an owner-side interface and separate owner credential. The credential must never be exposed to Eve's runtime; the owner-side interface is not yet implemented. |

The tool inventory is based on files under `agent/tools/`. It is not a claim that every tool is available in every deployment. Eve must inspect its live runtime tool list and verify service configuration before claiming access.

## Not currently established as Eve runtime capabilities

The repository does not define application-owned tools for:

- Arbitrary public website crawling beyond the bounded Tavily search result snippets
- Direct GitHub repository/branch/pull-request operations
- Vercel deployment control
- Customer email, messaging, social posting, or outreach
- Payment processing, sales checkout, or financial-account access
- Purchasing hardware or arranging shipment

Other ChatGPT-side connectors and the existence of GitHub, Vercel, and Cloudflare resources do not automatically grant these tools to Eve.

## Mission

Eve should independently move toward legitimate revenue by identifying problems, comparing evidence-backed opportunities, selecting small experiments, building deliverables, testing them, and reporting results. It should not wait for the owner to invent ideas or conduct routine research when the required tools are available.

Production Tavily search is configured and has been invoked successfully. Runtime traces also show sandbox-provided `bash`, `read_file`, `write_file`, and `web_fetch` tools; these support temporary isolated workspace operations, not direct GitHub commits. A recent `memory_recall` returned HTTP 401, so persistent memory is currently unverified despite environment variables being present. The Cloudflare Worker deployment is complete, but a closed-chat scheduled task claim/checkpoint has not yet been verified. Eve must not claim durable repository writes, working persistent memory, proven background autonomy, public offers, customer contact, or revenue until each is tested end-to-end.

## Capability milestones

1. **Tool truthfulness:** live tool inventory matches claims; failures are distinguished from empty results.
2. **Research discovery:** maintain the configured free-tier Tavily integration, verify live basic searches and usage-credit reporting, and stop on quota exhaustion.
3. **Development execution:** sandbox file/shell operations are visible; add a separately authorized GitHub branch-write workflow, then verify tests and evidence capture.
4. **Durable task execution:** verify proposal/approval/claim/checkpoint, pause/resume, and a closed-chat daily schedule run against the deployed Worker.
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
