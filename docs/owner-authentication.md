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

## Private owner-auth diagnostics

The Vercel server exposes `/api/owner/diagnostic` to an already signed-in owner session. It reads the OAuth token from the HttpOnly cookie on the server and calls the Worker-only `POST /v1/internal/owner-auth-diagnostic` endpoint. The browser never receives or supplies the Worker shared secret, and the Worker endpoint rejects every request containing an `Origin` header. The Worker requires the existing `MEMORY_API_TOKEN` server-to-server credential using constant-time comparison.

The diagnostic sends the Vercel Production `GITHUB_CLIENT_ID` to the Worker for an exact in-memory comparison with the Worker `GITHUB_CLIENT_ID`. It returns only `client_id_match: true|false`; it never returns either Client ID, the OAuth secret, the session token, GitHub response bodies, or owner identifiers. It then verifies the token against the Worker's configured OAuth app and checks the immutable owner ID. The diagnostic bypasses the ordinary owner-auth failure limiter so a previous burst of failed owner requests cannot hide the underlying OAuth result. A separate five-second per-isolate diagnostic cooldown returns its own explicit reason code.

Worker diagnostic reason codes:

| Reason code | Meaning |
|---|---|
| `owner_auth_ok` | Client IDs match; OAuth app and immutable owner checks passed. |
| `vercel_client_id_missing` | Vercel did not provide a Client ID. |
| `worker_client_id_missing` | Worker Client ID is not configured. |
| `oauth_client_id_mismatch` | Vercel and Worker Client IDs differ. |
| `worker_client_secret_missing` | Worker OAuth Client Secret is missing. |
| `worker_owner_id_missing_or_invalid` | Worker owner ID is missing or invalid. |
| `owner_session_token_missing_or_invalid` | The server-side owner session token is missing or malformed. |
| `oauth_app_credentials_rejected` | GitHub rejected the Worker's OAuth app credentials. |
| `owner_token_not_recognized_by_configured_app` | The session token is not recognized as belonging to the configured OAuth app. |
| `github_oauth_check_failed` | GitHub returned an unexpected OAuth token-check response. |
| `github_oauth_api_unavailable` | The GitHub OAuth token-check API is unavailable. |
| `github_user_verification_failed` | GitHub could not verify the session's authenticated user. |
| `github_user_api_unavailable` | The GitHub user API is unavailable. |
| `owner_id_mismatch` | The token belongs to a GitHub account other than the configured immutable owner. |
| `server_shared_secret_missing` | The Worker shared server credential is not configured. |
| `owner_auth_rate_limited` | An ordinary owner route hit its 10-failures-per-60-seconds limiter; HTTP 429. |
| `owner_session_invalid` | The Vercel server does not have a valid owner session cookie. |
| `worker_service_unavailable` | The Vercel server could not reach the Worker diagnostic endpoint. |
| `diagnostic_response_invalid` | The Worker returned a response that was not a valid diagnostic JSON object. |
| `diagnostic_access_denied` | The private endpoint did not receive its server credential or was called with a browser Origin. |
| `diagnostic_request_invalid` | The diagnostic payload is malformed or contains unexpected fields. |
| `diagnostic_rate_limited` | The private diagnostic cooldown is active. |

Ordinary owner routes return `owner_auth_rate_limited` with HTTP 429 when their existing per-isolate failure limit is active; other authentication failures retain HTTP 401 and include their distinct `reason_code`. The existing owner failure window remains 10 failures per 60 seconds. The diagnostic endpoint has a separate five-second per-isolate cooldown and does not reset or alter the ordinary limiter.

The Vercel server route can also return `owner_session_invalid` when the HttpOnly owner session is missing or no longer verifies, `worker_service_unavailable` when the Worker cannot be reached, or `diagnostic_response_invalid` if the Worker returns an unreadable response. These are server/transport failures, not OAuth credential verdicts.

To run the diagnostic after an approved deployment, sign in to the owner console and open `https://autonomous-dev-ai.vercel.app/api/owner/diagnostic` in the same browser session. The response contains only the reason code and the Client ID match boolean.

