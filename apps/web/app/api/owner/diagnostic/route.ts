import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { OWNER_SESSION_COOKIE, getVerifiedOwnerLogin } from "@/lib/owner-github";
import {
  OWNER_DIAGNOSTIC_WORKER_UNAVAILABLE,
  normalizeOwnerDiagnosticPayload,
  ownerDiagnosticGateReason,
} from "@/lib/owner-diagnostic-response.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MEMORY_API = "https://autonomous-dev-memory.molson835.workers.dev";

export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ reason_code: "diagnostic_access_denied" }, { status: 403, headers: { "cache-control": "no-store" } });
  }

  const login = await getVerifiedOwnerLogin();
  const accessToken = (await cookies()).get(OWNER_SESSION_COOKIE)?.value;
  const sharedSecret = process.env.MEMORY_API_TOKEN;
  const gateReason = ownerDiagnosticGateReason({
    ownerSessionValid: !!login,
    accessToken,
    sharedSecret,
  });
  if (gateReason) {
    return NextResponse.json({ reason_code: gateReason }, {
      status: gateReason === "server_shared_secret_missing" ? 503 : 401,
      headers: { "cache-control": "no-store" },
    });
  }

  try {
    const upstream = await fetch(MEMORY_API + "/v1/internal/owner-auth-diagnostic", {
      method: "POST",
      headers: {
        authorization: "Bearer " + sharedSecret,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        access_token: accessToken,
        expected_client_id: process.env.GITHUB_CLIENT_ID ?? "",
      }),
      cache: "no-store",
    });
    const payload = normalizeOwnerDiagnosticPayload(await upstream.json().catch(() => null));
    return NextResponse.json(payload, {
      status: upstream.status,
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json(OWNER_DIAGNOSTIC_WORKER_UNAVAILABLE, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
