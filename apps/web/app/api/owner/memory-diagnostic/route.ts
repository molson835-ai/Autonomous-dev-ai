import { NextResponse } from "next/server";
import { getVerifiedOwnerLogin, isSameOriginRequest } from "@/lib/owner-github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPECTED_WORKER_HOST = "autonomous-dev-memory.molson835.workers.dev";
const REQUEST_TIMEOUT_MS = 8000;

type ProbeResult = {
  name: string;
  status: number | null;
  ok: boolean;
  duration_ms: number;
  result: "ok" | "http_error" | "timeout" | "network_error";
  content_type?: string;
  body_kind?: "json" | "non_json" | "empty";
  response_bytes?: number;
  response_keys?: string[];
};

function unavailable(configuration: string, hostMatchesExpected: boolean | null) {
  return NextResponse.json({
    checked_at: new Date().toISOString(),
    environment: process.env.VERCEL_ENV ?? "unknown",
    configured: false,
    configuration,
    host_matches_expected: hostMatchesExpected,
    checks: [],
  }, { headers: { "cache-control": "no-store" } });
}

async function probe(name: string, endpoint: URL): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        authorization: "Bearer " + process.env.MEMORY_API_TOKEN,
        accept: "application/json",
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = await response.text();
    let bodyKind: ProbeResult["body_kind"] = body.length === 0 ? "empty" : "non_json";
    let responseKeys: string[] | undefined;
    if (body.length > 0) {
      try {
        const parsed: unknown = JSON.parse(body);
        bodyKind = "json";
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          responseKeys = Object.keys(parsed).slice(0, 12);
        } else if (Array.isArray(parsed)) {
          responseKeys = ["<array>"];
        }
      } catch {
        // Never return upstream response text: it may contain memory contents or secrets.
      }
    }
    return {
      name,
      status: response.status,
      ok: response.ok,
      duration_ms: Date.now() - started,
      result: response.ok ? "ok" : "http_error",
      content_type: response.headers.get("content-type") ?? undefined,
      body_kind: bodyKind,
      response_bytes: new TextEncoder().encode(body).byteLength,
      response_keys: responseKeys,
    };
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      name,
      status: null,
      ok: false,
      duration_ms: Date.now() - started,
      result: timedOut ? "timeout" : "network_error",
    };
  }
}

export async function GET(request: Request) {
  if (!isSameOriginRequest(request) && request.headers.has("origin")) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403, headers: { "cache-control": "no-store" } });
  }

  const ownerLogin = await getVerifiedOwnerLogin();
  if (!ownerLogin) {
    return NextResponse.json({ error: "Sign in with the owner GitHub account to run diagnostics." }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  const baseUrl = process.env.MEMORY_API_URL;
  const token = process.env.MEMORY_API_TOKEN;
  if (!baseUrl || !token) return unavailable("missing_url_or_token", null);

  let parsedBase: URL;
  try {
    parsedBase = new URL(baseUrl);
  } catch {
    return unavailable("invalid_url", false);
  }
  if (parsedBase.protocol !== "https:" || parsedBase.username || parsedBase.password || parsedBase.search || parsedBase.hash) {
    return unavailable("invalid_url", false);
  }
  const hostMatchesExpected = parsedBase.hostname.toLowerCase() === EXPECTED_WORKER_HOST && (!parsedBase.port || parsedBase.port === "443");
  if (!hostMatchesExpected) return unavailable("worker_host_mismatch", false);

  const recallUrl = new URL("/v1/recall?limit=1", parsedBase);
  const experienceUrl = new URL("/v1/experiences", parsedBase);
  experienceUrl.searchParams.set("external_id", "__eve_owner_diagnostic_missing_" + crypto.randomUUID() + "__");

  const checks = await Promise.all([
    probe("memory_recall", recallUrl),
    probe("memory_experiences", experienceUrl),
  ]);

  return NextResponse.json({
    checked_at: new Date().toISOString(),
    environment: process.env.VERCEL_ENV ?? "unknown",
    configured: true,
    configuration: "ok",
    host_matches_expected: true,
    checks,
  }, { headers: { "cache-control": "no-store" } });
}
