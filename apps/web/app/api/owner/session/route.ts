import { NextResponse } from "next/server";
import { getVerifiedOwnerLogin } from "@/lib/owner-github";

export const runtime = "nodejs";

export async function GET() {
  const login = await getVerifiedOwnerLogin();
  if (!login) return NextResponse.json({ authenticated: false }, { status: 401, headers: { "cache-control": "no-store" } });
  return NextResponse.json({ authenticated: true, login }, { headers: { "cache-control": "no-store" } });
}
