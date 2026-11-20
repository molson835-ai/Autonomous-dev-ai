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
  const configuration = result.checks.some(check => check.error_code === "configuration_missing")
    ? "missing"
    : result.checks.some(check => check.error_code === "configuration_invalid")
      ? "invalid"
      : result.checks.some(check => check.error_code === "worker_host_mismatch")
        ? "host mismatch"
        : "configured";
  return NextResponse.json({
    ...result,
    checked_at: new Date().toISOString(),
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    configuration,
  }, { headers: { "cache-control": "no-store" } });
}
