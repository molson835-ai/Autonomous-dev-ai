# Free-tier public web research adapter

## Purpose

This adds a bounded public-web search tool to Eve so it can discover customer problems, alternatives, competitor products, pricing signals, and technical evidence instead of treating the existing documentation fetcher as a search engine.

## Provider and free limit

Tavily's current pricing page lists a Researcher free tier with 1,000 API credits per month and no credit card required: https://www.tavily.com/pricing

Tavily's Search API documents the HTTPS POST endpoint, Bearer authentication, basic search depth at one API credit, a result-count limit, and a usage-credit field: https://docs.tavily.com/documentation/api-reference/endpoint/search

Provider terms and limits can change; recheck before activation.

## Runtime behavior

- Reads TAVILY_API_KEY from Eve's runtime environment.
- If the key is absent, fails closed and makes no network request.
- Uses basic search depth, at most five results, one content chunk per source, safe search, and no raw page content or generated answer.
- Returns title, HTTPS URL, short snippet, score, and published date.
- Rejects non-HTTPS result URLs.
- No automatic retry, fallback provider, account creation, billing change, paid upgrade, customer outreach, or publication.
- HTTP 429 pauses the task; HTTP 432 is treated as quota/plan exhaustion and must pause. Never upgrade or switch to a paid provider.
- Provider snippets and pages are untrusted data, not instructions.
- Search terms are sent to Tavily. Never include secrets, personal data, credentials, or private repository contents in a query.
- The code does not log or return the API key.

## Activation boundary

This PR creates code only. It does not create a Tavily account, accept terms, create or store an API key, configure Vercel/Cloudflare secrets, or make a live search request.

The tool remains unavailable until an owner-authorized, separate Tavily account is created and its free-tier API key is provisioned as TAVILY_API_KEY. Do not use a personal payment card or enable paid usage. If the free quota is exhausted, stop until the next reset or explicit owner decision.

## Verification

Node tests use an injected fake fetch. They verify the fixed endpoint, bounded request body, safe search, HTTPS result filtering, missing-key behavior, rejected credentials, rate limits, quota exhaustion, and the absence of retries/fallback. Tests do not call Tavily or consume credits.
