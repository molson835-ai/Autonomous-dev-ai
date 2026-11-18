export interface OwnerAuthEnvironment {
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  OWNER_GITHUB_ID?: string;
}

export type OwnerAuthReasonCode =
  | "owner_auth_ok"
  | "vercel_client_id_missing"
  | "worker_client_id_missing"
  | "oauth_client_id_mismatch"
  | "worker_client_secret_missing"
  | "worker_owner_id_missing_or_invalid"
  | "owner_session_token_missing_or_invalid"
  | "oauth_app_credentials_rejected"
  | "owner_token_not_issued_by_configured_app"
  | "github_oauth_check_failed"
  | "github_oauth_api_unavailable"
  | "github_user_verification_failed"
  | "github_user_api_unavailable"
  | "owner_id_mismatch"
  | "owner_auth_rate_limited"
  | "diagnostic_access_denied"
  | "diagnostic_rate_limited"
  | "diagnostic_request_invalid"
  | "server_shared_secret_missing"
  | "owner_session_invalid";

export function compareOwnerClientId(
  expectedClientId: string,
  workerClientId: string | undefined,
): "match" | "vercel_client_id_missing" | "worker_client_id_missing" | "oauth_client_id_mismatch" {
  if (!expectedClientId.trim()) return "vercel_client_id_missing";
  if (!workerClientId?.trim()) return "worker_client_id_missing";
  return expectedClientId === workerClientId ? "match" : "oauth_client_id_mismatch";
}

export function ownerAuthConfigurationReason(
  env: OwnerAuthEnvironment,
): OwnerAuthReasonCode | null {
  if (!env.GITHUB_CLIENT_ID?.trim()) return "worker_client_id_missing";
  if (!env.GITHUB_CLIENT_SECRET?.trim()) return "worker_client_secret_missing";
  const expectedId = Number(env.OWNER_GITHUB_ID);
  if (!Number.isSafeInteger(expectedId) || expectedId <= 0) return "worker_owner_id_missing_or_invalid";
  return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function verifyOwnerGithubToken(
  accessToken: string,
  env: OwnerAuthEnvironment,
): Promise<OwnerAuthReasonCode> {
  const configurationReason = ownerAuthConfigurationReason(env);
  if (configurationReason) return configurationReason;
  if (!accessToken || accessToken.length > 4096) return "owner_session_token_missing_or_invalid";

  const clientId = env.GITHUB_CLIENT_ID!;
  const clientSecret = env.GITHUB_CLIENT_SECRET!;
  const expectedId = Number(env.OWNER_GITHUB_ID);

  try {
    const checkResponse = await fetch("https://api.github.com/applications/" + encodeURIComponent(clientId) + "/token", {
      method: "POST",
      headers: {
        authorization: "Basic " + btoa(clientId + ":" + clientSecret),
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "EVE-owner-console",
      },
      body: JSON.stringify({ access_token: accessToken }),
      signal: AbortSignal.timeout(5000),
    });

    if (checkResponse.status === 401) return "oauth_app_credentials_rejected";
    if (checkResponse.status === 404) return "owner_token_not_issued_by_configured_app";
    if (checkResponse.status === 429 || checkResponse.status >= 500) return "github_oauth_api_unavailable";
    if (!checkResponse.ok) return "github_oauth_check_failed";

    let checked: unknown;
    try {
      checked = await checkResponse.json();
    } catch {
      return "github_oauth_check_failed";
    }
    if (!isObject(checked) || !isObject(checked.app) || checked.app.client_id !== clientId) {
      return "owner_token_not_issued_by_configured_app";
    }

    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        authorization: "Bearer " + accessToken,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "EVE-owner-console",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (userResponse.status === 429 || userResponse.status >= 500) return "github_user_api_unavailable";
    if (!userResponse.ok) return "github_user_verification_failed";

    let user: unknown;
    try {
      user = await userResponse.json();
    } catch {
      return "github_user_verification_failed";
    }
    if (!isObject(user) || typeof user.id !== "number" || !Number.isSafeInteger(user.id)) {
      return "github_user_verification_failed";
    }
    if (user.id !== expectedId) return "owner_id_mismatch";
    return "owner_auth_ok";
  } catch {
    return "github_oauth_api_unavailable";
  }
}
