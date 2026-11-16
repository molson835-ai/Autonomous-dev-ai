import { NextRequest, NextResponse } from "next/server";
import { isConfiguredOwnerId, OWNER_GITHUB_LOGIN, OWNER_OAUTH_STATE_COOKIE, OWNER_SESSION_COOKIE } from "@/lib/owner-github";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const redirectToOwner = () => NextResponse.redirect(new URL("/owner", request.url));
  const state = request.nextUrl.searchParams.get("state");
  const savedState = request.cookies.get(OWNER_OAUTH_STATE_COOKIE)?.value;
  const code = request.nextUrl.searchParams.get("code");
  if (!state || !savedState || state !== savedState || !code) {
    const response = redirectToOwner();
    response.cookies.set(OWNER_OAUTH_STATE_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth/github/callback", maxAge: 0 });
    return response;
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return NextResponse.json({ error: "GitHub sign-in is not configured." }, { status: 503 });

  try {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code }),
      cache: "no-store",
    });
    if (!tokenResponse.ok) throw new Error("GitHub token exchange failed.");
    const tokenData: unknown = await tokenResponse.json();
    if (!tokenData || typeof tokenData !== "object" || !("access_token" in tokenData) || typeof tokenData.access_token !== "string") {
      throw new Error("GitHub did not return an access token.");
    }
    const accessToken = tokenData.access_token;
    const userResponse = await fetch("https://api.github.com/user", {
      headers: { authorization: "Bearer " + accessToken, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "EVE-owner-console" },
      cache: "no-store",
    });
    if (!userResponse.ok) throw new Error("Could not verify the GitHub account.");
    const user: unknown = await userResponse.json();
    if (!user || typeof user !== "object" || !("login" in user) || typeof user.login !== "string" || user.login.toLowerCase() !== OWNER_GITHUB_LOGIN || !("id" in user) || !isConfiguredOwnerId(user.id)) {
      const response = redirectToOwner();
      response.cookies.set(OWNER_OAUTH_STATE_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth/github/callback", maxAge: 0 });
      return response;
    }

    const response = NextResponse.redirect(new URL("/owner", request.url));
    response.cookies.set(OWNER_SESSION_COOKIE, accessToken, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
      path: "/api/owner", maxAge: 8 * 60 * 60,
    });
    response.cookies.set(OWNER_OAUTH_STATE_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth/github/callback", maxAge: 0 });
    return response;
  } catch {
    const response = redirectToOwner();
    response.cookies.set(OWNER_OAUTH_STATE_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth/github/callback", maxAge: 0 });
    return response;
  }
}
