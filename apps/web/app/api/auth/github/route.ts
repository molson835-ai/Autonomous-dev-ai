import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { OWNER_OAUTH_RETURN_COOKIE, OWNER_OAUTH_STATE_COOKIE } from "@/lib/owner-github";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "GitHub sign-in is not configured." }, { status: 503 });
  const state = randomBytes(32).toString("hex");
  const callback = new URL("/api/auth/github/callback", request.url).toString();
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", callback);
  authorize.searchParams.set("scope", "read:user");
  authorize.searchParams.set("state", state);
  const response = NextResponse.redirect(authorize);
  response.cookies.set(OWNER_OAUTH_STATE_COOKIE, state, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/api/auth/github/callback", maxAge: 600,
  });
  const returnTo = new URL(request.url).searchParams.get("return_to") === "/" ? "/" : "/owner";
  response.cookies.set(OWNER_OAUTH_RETURN_COOKIE, returnTo, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/api/auth/github/callback", maxAge: 600,
  });
  return response;
}
