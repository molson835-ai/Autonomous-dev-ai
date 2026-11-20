# Phase 4D — evidence-grounded service opportunity assessments

## Purpose

Turn bounded public research into a draft assessment that separates source-attributed observations, hypotheses, unknowns, and recommendations. This is the first Phase 4D deliverable; it does not establish demand or authorize business activity.

## Assessment structure

- Research question, target buyer, and problem statement.
- Source observations with a stable ID, short attributed statement, title, HTTPS URL, source category, access timestamp, and optional publication timestamp.
- Hypotheses with explicit references to the observations they rely on. Unreferenced hypotheses remain visibly speculative.
- Unknowns that research has not resolved.
- Recommendations with supporting observation references and explicit assumptions.

## Validation

The helper checks bounded input sizes, unique observation IDs and source URLs, HTTPS URLs without embedded credentials, timezone-qualified RFC3339 timestamps, and references to observations that exist in the same assessment. It reports the number of observations and distinct hostnames.

Distinct hostnames are not proof of independent ownership or reporting. URL and timestamp checks are syntactic only. The helper does not fetch sources, verify publisher identity, confirm quotations, establish source independence, or determine whether a market claim is true.

## Existing research capabilities and blockers

- search_news provides limited GDELT article discovery leads; each important claim must be checked at the publisher.
- research_sources retrieves supplied URLs from a narrow technical-documentation allowlist; it is not a general market-source fetcher.
- research_web uses Tavily basic search but fails closed until the no-cost plan and billing limits are verified and the explicit EVE_TAVILY_FREE_PLAN_VERIFIED=true gate is configured. Do not set that gate based only on the presence of an API key.
- The existing opportunity evaluator is a heuristic. Its numeric signals are supplied by the agent and are not independently verified by the evaluator. A score is not a demand or revenue forecast.

## Safety

This assessment tool is read-only and draft-only. It cannot contact prospects, publish offers, accept payments, access financial accounts, spend money, create tasks, or write persistent memory. It does not fetch URLs or execute page content. All source material and supplied analysis remain untrusted until independently reviewed.

No paid dependency or provider is introduced. Any later live provider test requires verified no-cost terms and the applicable owner approval. Production deployment remains a separate approval.
