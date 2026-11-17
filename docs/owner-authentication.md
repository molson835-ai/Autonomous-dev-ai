# Owner authentication setup

Owner-only Worker routes must not trust a GitHub login name alone or accept any valid GitHub token from the owner account. The Worker verifies both the OAuth application that issued the token and the immutable numeric GitHub user ID.

## Required configuration

Configure the following in the Vercel Production environment for the owner console:

- `GITHUB_CLIENT_ID`: the GitHub OAuth App client ID used by the owner-console sign-in flow.
- `GITHUB_CLIENT_SECRET`: the matching OAuth App client secret.
- `OWNER_GITHUB_ID`: the immutable numeric GitHub user ID for the owner account.

Configure these in the GitHub Actions `cloudflare-production` environment:

- Secrets: `CLOUDFLARE_API_TOKEN`, `MEMORY_API_TOKEN`, `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, and `CLOUDFLARE_ANALYTICS_API_TOKEN` (read-only Account Analytics permission).
- Variable or secret: `OWNER_GITHUB_ID`.
- The OAuth secret names intentionally use the `OAUTH_` prefix because GitHub reserves names beginning with `GITHUB_` for its own use.

Set `OAUTH_CLIENT_ID` to the same OAuth App client ID stored as Vercel Production `GITHUB_CLIENT_ID`. Set `OAUTH_CLIENT_SECRET` to the same OAuth App client secret stored as Vercel Production `GITHUB_CLIENT_SECRET`. Do not create a second OAuth App just for the Worker.

The manual Worker deployment workflow reads the allowed GitHub Actions secret names `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET`, then writes their values into the Worker secrets `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`, which are the names expected by the Worker runtime. The workflow also copies the owner ID, Memory API token, Cloudflare account ID, and read-only Analytics token into Worker secrets. Do not put these values in source code, logs, task metadata, memory, or client-side browser code.

To obtain the numeric owner ID, query the public GitHub user record for the intended account and copy its numeric `id` field. Do not use the login string as a substitute. Confirm the value independently before configuring it.

## Runtime checks

For each owner-only request, the Worker:

1. Checks the access token against GitHub's OAuth application token-check endpoint using the configured client ID and secret.
2. Requires the returned application client ID to equal the configured OAuth App client ID.
3. Calls GitHub's authenticated user endpoint and requires its numeric `id` to equal `OWNER_GITHUB_ID`.
4. Caches successful verification for up to 60 seconds and applies a best-effort per-edge-isolate failure limit.

The cache and failure limiter are intentionally short-lived, in-memory protections, not a globally coordinated rate limiter. GitHub/API failures, missing configuration, malformed responses, or mismatched identities fail closed. The legacy `TASK_OWNER_APPROVAL_TOKEN` bypass is not supported; owner-only routes require the verified GitHub OAuth token.

## Deployment and acceptance

The Worker workflow is manual and requires the explicit `DEPLOY` confirmation. This change does not deploy the Worker. Before production deployment, configure all required values in Vercel and the GitHub Actions environment, then deploy only with owner approval.

After an approved deployment, verify:
- Owner-console OAuth sign-in succeeds for the configured immutable owner ID.
- A token from another OAuth app is rejected, even if it belongs to the same GitHub account.
- A token from a different GitHub user is rejected, even if the login name resembles the configured owner.
- Wrong or missing app credentials fail closed with HTTP 401 on owner-only routes.
- Ordinary agent credentials cannot access owner-only routes.
