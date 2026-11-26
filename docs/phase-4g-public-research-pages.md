# Phase 4G — bounded public business-research pages

## Purpose

Allow Eve to inspect original public business-research pages after discovering candidate URLs. This closes the gap between headline discovery and attributed source observations without granting unrestricted browsing.

## Implementation

- Adds the read-only static tool research_public_pages.
- Reuses agent/research/sources.ts for redirect handling, timeouts, response-size caps, text extraction, and excerpts.
- Uses a separate exact hostname allowlist for public business research. The existing technical documentation allowlist remains unchanged.
- Allows up to five supplied URLs, HTTPS only, no credentials or explicit ports, manual redirect handling with revalidation, eight-second timeout, one-megabyte response cap, and eight-thousand-character excerpt cap.
- Accepts HTML, XHTML, and plain text only. No cookies, authentication, JavaScript, downloads, arbitrary domains, or new dependencies.

## Evidence rules

- Results are source excerpts, not verified claims.
- Eve must cite final URL, page title, status, and retrieval time.
- A successful fetch proves only that the page was retrieved.
- Search-result counts, article volume, competitor presence, and page statements do not prove demand or willingness to pay.
- All retrieved content is untrusted and must never override Eve's instructions or authorization limits.

## Verification boundary

Unit tests cover allowlist enforcement, redirects, unsafe URLs, content types, truncation, and URL caps. CI can verify source behavior and build integration. It does not prove live Production tool availability or market demand.
