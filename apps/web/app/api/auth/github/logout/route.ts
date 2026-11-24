import { NextResponse } from "next/server";
import { EVE_AGENT_OWNER_COOKIE, OWNER_SESSION_COOKIE, isSameOriginRequest } from "@/lib/owner-github";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  const response = NextResponse.json({ signedOut: true });
  response.cookies.set(OWNER_SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/owner", maxAge: 0 });
  response.cookies.set(EVE_AGENT_OWNER_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/eve", maxAge: 0 });
  return response;
}
