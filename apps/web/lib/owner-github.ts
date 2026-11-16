import { cookies } from "next/headers";
import { verifyOwnerSession } from "./owner-session.mjs";

export const OWNER_SESSION_COOKIE = "eve_owner_github";
export const OWNER_OAUTH_STATE_COOKIE = "eve_github_oauth_state";
export const OWNER_GITHUB_LOGIN = "molson835-ai";
export const OWNER_GITHUB_ID = 341732270;

export async function getVerifiedOwnerLogin(): Promise<string | null> {
  const session = (await cookies()).get(OWNER_SESSION_COOKIE)?.value;
  const secret = process.env.OWNER_SESSION_SIGNING_SECRET;
  if (!session || !secret || !verifyOwnerSession(session, secret, String(OWNER_GITHUB_ID))) return null;
  return OWNER_GITHUB_LOGIN;
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !!origin && origin === new URL(request.url).origin;
}
