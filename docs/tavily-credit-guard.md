# Tavily free-plan guard

## Scope

Eve's Tavily adapter uses basic search only. Tavily's Researcher free plan currently includes 1,000 credits per month; basic search is listed as 1 credit per request. Pay-as-you-go must remain disabled in the provider account. See Tavily's [billing and usage limits](https://help.tavily.com/articles/8298987937-billing-credits-usage-limits) and [basic versus advanced search](https://help.tavily.com/articles/6938147944-basic-vs-advanced-search-what-is-the-difference).

## Eve-side enforcement

- The Cloudflare Durable Object stores a monthly UTC credit ledger and in-flight reservations.
- Eve may reserve only one credit per request, matching the adapter's fixed basic-search mode.
- The durable monthly cap is 800 credits, intentionally leaving 200 credits of the advertised free allowance outside Eve's budget.
- A request is not sent until the Durable Object confirms the reservation.
- Returned provider usage is settled against the reservation. If usage is missing, malformed, or a network failure makes the outcome ambiguous, the reserved credit is charged conservatively.
- Abandoned reservations older than 24 hours are charged rather than released.
- The ledger is authenticated with the existing Worker shared credential and fails closed if unavailable.
- No automatic retry, paid fallback, plan change, or billing action is performed.

## Boundaries and limitations

The ledger accounts for Eve's calls through this adapter only. It cannot see searches made manually in the Tavily dashboard, by other API keys, or by other applications. The 200-credit headroom is therefore a buffer, not a provider-enforced account-wide limit. Tavily's own free-plan hard stop and the owner's setting that pay-as-you-go is disabled remain the external billing safeguards.

The free-plan verification flag `EVE_TAVILY_FREE_PLAN_VERIFIED=true` must be added to the Vercel Production environment only after the owner verifies the Researcher free plan and pay-as-you-go disabled. The flag is a human attestation; it does not independently inspect billing settings. Do not add or activate it as part of this code change.

## Activation

1. Merge and deploy the code through the normal reviewed process.
2. Add the free-plan verification flag to Vercel Production only after owner confirmation; leave the existing API key server-side.
3. Keep the task queue paused.
4. Run one separately owner-approved basic-search diagnostic and verify the returned credit usage is recorded in the durable ledger.
5. Do not resume autonomous research tasks until the diagnostic succeeds.

This document describes the intended code behavior; it does not itself prove the Production deployment or a live Tavily request succeeded.
