import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { OWNER_SESSION_COOKIE, getVerifiedOwnerLogin } from "@/lib/owner-github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MEMORY_API = "https://autonomous-dev-memory.molson835.workers.dev";

export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ reason_code: "diagnostic_access_denied" }, { status: 403, headers: { "cache-control": "no-store" } });
  }

  const login = await getVerifiedOwnerLogin();
  if (!login) {
    return NextResponse.json({ reason_code: "owner_session_invalid" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  const accessToken = (await cookies()).get(OWNER_SESSION_COOKIE)?.value;
  if (!accessToken || accessToken.length > 4096) {
    return NextResponse.json({ reason_code: "owner_session_invalid" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  const sharedSecret = process.env.MEMORY_API_TOKEN;
  if (!sharedSecret) {
    return NextResponse.json({ reason_code: "server_shared_secret_missing" }, { status: 503, headers: { "cache-control": "no-store" } });
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
    const payload = await upstream.json().catch(() => ({ reason_code: "diagnostic_response_invalid" }));
    return NextResponse.json(payload, {
      status: upstream.status,
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ reason_code: "worker_service_unavailable" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
