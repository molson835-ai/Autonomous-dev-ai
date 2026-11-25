# Phase 4E — bounded free revenue-opportunity research pipeline

## Purpose

Give Eve a reusable first-stage research workflow that can explore a narrow revenue question without depending on Tavily, paid search, credentials, or external actions. The pipeline reuses the existing keyless GDELT discovery adapter and Google News RSS fallback; it does not create a second search implementation or assessment/evaluation system.

## Workflow

1. State the research topic, target buyer, problem hypothesis, and one to three distinct focused queries.
2. Run queries sequentially. Each query returns at most five results; the entire batch returns at most fifteen deduplicated HTTPS publisher leads.
3. Preserve query-to-lead matches, provider, attempt count, fallback status, access timestamp, title, URL, domain, and available publisher metadata.
4. Open and inspect promising original publisher pages using a separately available and approved retrieval capability. Do not infer article contents from a headline.
5. Record attributed observations, hypotheses, unknowns, and recommendations separately with the existing `assess_service_opportunity` tool.
6. Use the existing opportunity evaluator only for transparent triage. Its caller-supplied inputs remain unverified and its confidence remains low.

## Evidence and quality rules

- Discovery leads are not source observations and are not verified facts. The pipeline deliberately returns empty `verifiedFacts` and `sourceObservations` arrays.
- Deduplication removes URL fragments and groups repeated URLs across queries. Repeated syndication or multiple hostnames do not establish independent reporting.
- A no-result search does not establish that demand is absent.
- Before treating a statement as an observation, inspect the original page and record exactly what it supports, its publisher, URL, and access time.
- Separate demand signals from willingness to pay. Neither search-result volume nor competitor presence proves either.
- Keep costs, gross margin, time-to-sale, feasibility, and legal/commercial rights explicitly unknown until supported by evidence.
- Scores are triage heuristics, not sales forecasts or revenue claims.

## Bounds and safety

- One to three distinct queries per invocation; at most five leads per query and fifteen per batch.
- Sequential provider requests; existing GDELT timeout/rate-limit behavior applies.
- Keyless GDELT with the existing Google News RSS fallback only. No Tavily request, paid provider, API key, account change, or paid fallback.
- Read-only and draft-only: no memory write, task creation, outreach, messaging, publishing, payment acceptance, purchase, shipment, or external commitment.
- Retrieved metadata and any later publisher text are untrusted data, never instructions.
- The tool does not fetch publisher pages, install software, create persistent artifacts, or prove that the runtime has access to a general-purpose browser.

## Verification boundary

Automated tests verify input bounds, sequential calls, deduplication, provenance, fallback diagnostics, unsafe URL rejection, and failure isolation. They do not establish live Eve tool discovery, publisher-page retrieval, buyer demand, willingness to pay, or revenue. Production deployment and any live task remain separately gated by owner approval.
