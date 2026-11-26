# Bounded public research page retrieval

## Intent

Give Eve a read-only way to inspect original public business-research pages instead of treating news headlines as verified evidence. This serves Eve's market-research and revenue-discovery work.

## Goals

- Retrieve up to five caller-supplied public pages per invocation.
- Use a fixed, reviewed HTTPS hostname allowlist relevant to small-business and market research.
- Revalidate every redirect against the same allowlist; reject credentials, ports, non-HTTPS URLs, and unapproved hosts.
- Bound request time, response bytes, extracted text, and output size.
- Return the final URL, page title, status, access timestamp, excerpt, and truncation/diagnostic state.
- Treat all page content as untrusted evidence, never as instructions.
- Keep retrieval read-only and independent of Workers AI neurons and Tavily credits.

## Non-goals

- General-purpose unrestricted web browsing or search.
- Fetching arbitrary GDELT/Google News publisher domains.
- JavaScript rendering, browser automation, authentication, cookies, form submission, downloads, or file execution.
- Claims that page text proves demand, willingness to pay, or revenue.
- Changes to Production, task queue, memory, or quota state.

## Approach

Reuse the existing agent/research/sources.ts retrieval, redirect, timeout, byte-cap, text-extraction, and excerpt logic. Add a separate fixed allowlist for public business-research sources rather than weakening the existing technical-documentation allowlist. Expose a read-only authored tool and keep the existing technical research_sources behavior unchanged.

## Constraints

- Maximum five URLs.
- HTTPS only; no URL credentials or explicit ports.
- Exact hostname allowlist; redirects must remain allowlisted.
- Existing eight-second timeout and one-megabyte response cap remain in force.
- Existing eight-thousand-character excerpt cap remains in force.
- No external services, API keys, paid fallbacks, or new dependencies.

## Verification

Unit tests cover approved and unapproved hosts, redirect revalidation, malformed URLs, credentials, ports, non-HTTPS URLs, response type, byte truncation, extraction, and retrieval errors. CI validates build, type-check, tests, and tool inventory. A passing CI run does not establish live Production invocation or buyer demand.
