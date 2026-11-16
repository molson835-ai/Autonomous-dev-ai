# Phase 1 security hardening

This change set closes three authority boundaries before any new autonomous capability is enabled.

## Autonomous task scope

Only four fixed type/scope pairs may be automatically queued:

| Task type | Owner-defined scope ID |
| --- | --- |
| market_research | internal_research |
| product_development | internal_code_changes |
| testing | internal_tests |
| documentation | internal_docs |

All customer discovery involving contact, outreach, publishing, purchases, payment, account creation, external commitments, Production deployments, and merges remain proposals requiring owner action. Free-text scope descriptions do not grant authority.

On the first Worker startup after this migration, legacy records marked mission-authorized but lacking a scope ID are revoked from the standing mandate. Tasks without prior owner approval are moved to proposed status.

## Quota telemetry

The model runtime sends only the requested reservation size and model ID. The Worker independently queries the Cloudflare GraphQL Analytics API with a Worker-only read token. The Worker rejects agent-supplied usage totals, checks the UTC date and authoritative aggregate, caches the result for 30 seconds, includes in-flight reservations, and fails closed on query or permissions errors.

The Worker needs these bindings:

- `CLOUDFLARE_ACCOUNT_ID`: non-secret Worker variable, set in `memory/worker/wrangler.jsonc`.
- `CLOUDFLARE_ANALYTICS_API_TOKEN`: dedicated Cloudflare token with Account Analytics Read for the EVE account; stored only as a Cloudflare Worker secret and GitHub Actions environment secret used by the manual Worker deploy workflow.
- `MEMORY_API_TOKEN`: existing agent-to-Worker API secret.

The token used for Worker deployment (`CLOUDFLARE_API_TOKEN`) is not the same as the runtime Analytics token.

## Owner-session authentication

The browser completes GitHub OAuth. The Vercel callback verifies both the owner login and immutable numeric GitHub user ID, then issues an app-signed HttpOnly session. The Vercel owner proxy converts that session into a separate five-minute Worker assertion. The Worker verifies the HMAC, issuer, audience, immutable subject, issue time, and expiry. Raw GitHub OAuth access tokens are not stored in the owner cookie or sent to the Worker.

The same randomly generated `OWNER_SESSION_SIGNING_SECRET` must be stored in both:

1. Vercel project environment variables, Production scope, for the owner callback and proxy.
2. GitHub Actions environment `cloudflare-production` as a secret, so the manual deploy workflow can set it as a Cloudflare Worker secret.

The Worker also requires `OWNER_GITHUB_ID`, configured as a non-secret variable in `wrangler.jsonc`.

Do not commit or paste any secret into source control or chat. If the signing secret is missing or differs between Vercel and the Worker, owner-console calls fail closed.

## Release sequence

1. Set `CLOUDFLARE_ANALYTICS_API_TOKEN` and `OWNER_SESSION_SIGNING_SECRET` in GitHub Actions environment `cloudflare-production`.
2. Set the same `OWNER_SESSION_SIGNING_SECRET` in Vercel Production environment variables.
3. Verify the Worker deployment dry run and all CI tests.
4. Deploy the Worker only through the explicit manual workflow input `DEPLOY`.
5. Verify that normal memory requests work, unauthenticated owner requests fail, signed owner sessions work, and invalid/stale quota telemetry prevents model calls.
6. Do not resume automated outreach, publication, spending, payments, or other external commitments. These remain owner-approved only.

This document describes the intended controls. CI results and live smoke tests are the evidence that they are enforced.
