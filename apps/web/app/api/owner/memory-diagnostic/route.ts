import { NextResponse } from "next/server";
import { getVerifiedOwnerLogin, isSameOriginRequest } from "@/lib/owner-github";
import { runOwnerMemoryProbe } from "@/lib/owner-memory-probe.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (request.headers.has("origin") && !isSameOriginRequest(request)) return NextResponse.json({ error: "Origin not allowed." }, { status: 403, headers: { "cache-control": "no-store" } });
  const ownerLogin = await getVerifiedOwnerLogin();
  if (!ownerLogin) return NextResponse.json({ error: "Owner authentication required." }, { status: 401, headers: { "cache-control": "no-store" } });
  const result = await runOwnerMemoryProbe({ baseUrl: process.env.MEMORY_API_URL, token: process.env.MEMORY_API_TOKEN });
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
