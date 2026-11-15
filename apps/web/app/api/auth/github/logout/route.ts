import { NextResponse } from "next/server";
import { OWNER_SESSION_COOKIE, isSameOriginRequest } from "@/lib/owner-github";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  const response = NextResponse.json({ signedOut: true });
  response.cookies.set(OWNER_SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/owner", maxAge: 0 });
  return response;
}
