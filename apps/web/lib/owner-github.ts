import { cookies } from "next/headers";

export const OWNER_SESSION_COOKIE = "eve_owner_github";
export const OWNER_OAUTH_STATE_COOKIE = "eve_github_oauth_state";
export const OWNER_GITHUB_LOGIN = "molson835-ai";
export const OWNER_GITHUB_ID = 341732270;

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
    if (!user || typeof user !== "object" || !("login" in user) || typeof user.login !== "string" || !("id" in user) || typeof user.id !== "number" || user.id !== OWNER_GITHUB_ID) return null;
    return user.login.toLowerCase() === OWNER_GITHUB_LOGIN ? user.login : null;
  } catch {
    return null;
  }
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !!origin && origin === new URL(request.url).origin;
}
