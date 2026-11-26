# Phase 4G — integrated public opportunity research

## Goal

Connect bounded news discovery to bounded retrieval of original public business-research pages without enabling unrestricted browsing, paid search, customer contact, or automatic evidence promotion.

## Flow

1. `research_revenue_opportunity` discovers at most three sequential GDELT/Google News queries, up to five results each, deduplicated across the batch. These are headline leads only.
2. `research_opportunity_evidence` runs the same bounded discovery and retrieves at most five URLs explicitly supplied by the caller. The reader uses a separate exact HTTPS hostname allowlist for public business sources; the existing technical-documentation allowlist remains separate.
3. Redirect destinations are revalidated against the same allowlist. Each response is limited to 8 seconds and 1 MB; only HTML, XHTML, and plain text are accepted; excerpts are capped at 8,000 characters. No cookies, credentials, JavaScript, downloads, arbitrary crawling, or link following.
4. Successful retrievals are returned as `retrieved_unverified` evidence candidates with final URL, title, access time, excerpt, and truncation status. They are not automatically written to memory or converted into verified facts.
5. A reviewer must inspect the original page and record a source-attributed observation only when the exact claim is directly supported. Use `assess_service_opportunity` to keep observations, hypotheses, unknowns, and recommendations separate.

## Safety and evidence rules

- GDELT/Google News results are discovery metadata, not evidence of the headline's claims.
- The page reader accepts only caller-supplied URLs. News URLs outside the allowlist are blocked; do not widen the allowlist casually or bypass it with another provider.
- Multiple hostnames do not prove independent ownership or corroboration. Syndicated articles must not be counted as independent evidence.
- Retrieval success proves only that a page was fetched. It does not prove accuracy, demand, willingness to pay, sales, margins, or profit.
- No memory write, task creation, external communication, publication, purchase, payment, or deployment is performed.
- Tavily remains fail-closed until the owner independently verifies the current no-cost plan and billing controls.

## Acceptance criteria

- Existing technical-documentation retrieval remains restricted to its original allowlist.
- Public business retrieval rejects non-HTTPS URLs, credentials, ports, unknown hosts, and redirects outside its allowlist before making a request to the destination.
- At most five unique caller-supplied URLs are fetched; response bytes, timeout, content type, and excerpt length are bounded.
- Tests cover allowed and rejected hosts, redirects, malformed URLs, content types, truncation, duplicate URLs, and allowlist separation.
- Tool inventory and Eve instructions describe the exact capability and its limitations.
- CI must pass before review. A green CI does not authorize merge, deployment, live Eve invocation, memory writes, or task execution.

## Not included

No unrestricted web search, automatic crawling, source graph or ownership resolution, independent corroboration algorithm, demand scoring, revenue forecast, customer outreach, publication, payments, purchases, or persistent memory writes.
