import { cookies } from "next/headers";

export const OWNER_SESSION_COOKIE = "eve_owner_github";
export const EVE_AGENT_OWNER_COOKIE = "eve_agent_owner";
export const OWNER_OAUTH_STATE_COOKIE = "eve_github_oauth_state";
export function isConfiguredOwnerId(value: unknown): boolean {
  const expected = Number(process.env.OWNER_GITHUB_ID);
  return Number.isSafeInteger(expected) && expected > 0 && typeof value === "number" && value === expected;
}

export async function getVerifiedOwnerLogin(): Promise<string | null> {
  const token = (await cookies()).get(OWNER_SESSION_COOKIE)?.value;
  if (!token || token.length > 4096) return null;
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        authorization: "Bearer " + token,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "EVE-owner-console",
      },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const user: unknown = await response.json();
    if (!user || typeof user !== "object" || !("login" in user) || typeof user.login !== "string" || !("id" in user) || !isConfiguredOwnerId(user.id)) return null;
    return user.login;
  } catch {
    return null;
  }
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !!origin && origin === new URL(request.url).origin;
}
