import { getVercelOidcToken } from "@vercel/oidc";
import { NextResponse } from "next/server";
import { OWNER_APPROVED_MANUAL_RUN_PROMPT } from "../../../../../../agent/prompts/owner-approved-manual-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MEMORY_API = "https://autonomous-dev-memory.molson835.workers.dev";
const MAX_BODY_BYTES = 2_000;

function constantTimeEqual(left: string, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== "production") {
    return NextResponse.json({ error: "Automatic task wake-up is available only in Production." }, { status: 409 });
  }

  const configuredToken = process.env.MEMORY_API_TOKEN ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  const suppliedToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!constantTimeEqual(suppliedToken, configuredToken)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Request body too large." }, { status: 413 });

  let body: unknown;
  try { body = JSON.parse(raw); } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid wake-up request." }, { status: 400 });
  }
  const value = body as Record<string, unknown>;
  if (Object.keys(value).some(key => !["task_id", "next_run_at", "operation_id"].includes(key)) ||
      typeof value.task_id !== "string" || !/^[0-9a-f-]{36}$/i.test(value.task_id) ||
      typeof value.next_run_at !== "string" || !Number.isFinite(Date.parse(value.next_run_at)) ||
      typeof value.operation_id !== "string" ||
      value.operation_id !== `eve-task-${value.task_id}-${Date.parse(value.next_run_at)}`) {
    return NextResponse.json({ error: "Invalid wake-up request fields." }, { status: 400 });
  }

  try {
    const statusUrl = new URL("/v1/internal/wakeup-status", MEMORY_API);
    statusUrl.searchParams.set("task_id", value.task_id);
    statusUrl.searchParams.set("next_run_at", value.next_run_at);
    const statusResponse = await fetch(statusUrl, {
      headers: { authorization: "Bearer " + configuredToken, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(7_000),
    });
    if (!statusResponse.ok) {
      return NextResponse.json({ error: "Could not verify the due task. No Eve session was started." }, { status: 502 });
    }
    const status = await statusResponse.json() as { eligible?: boolean };
    if (status.eligible !== true) {
      return NextResponse.json({ accepted: false, skipped: true, reason: "The task is no longer due or the queue is not eligible." }, { status: 200 });
    }

    // Vercel injects a short-lived OIDC identity into this Production Function.
    // Eve independently validates that identity through its vercelOidc channel.
    const oidcToken = await getVercelOidcToken();
    const eveResponse = await fetch(new URL("/eve/v1/session", request.url), {
      method: "POST",
      headers: {
        authorization: "Bearer " + oidcToken,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        message: OWNER_APPROVED_MANUAL_RUN_PROMPT,
        operationId: value.operation_id,
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    const payload: unknown = await eveResponse.json().catch(() => null);
    if (!eveResponse.ok || !payload || typeof payload !== "object" ||
        !("sessionId" in payload) || typeof payload.sessionId !== "string") {
      return NextResponse.json({ error: "Eve did not confirm session acceptance." }, { status: 502 });
    }

    return NextResponse.json({
      accepted: true,
      session_id: payload.sessionId,
      operation_id: value.operation_id,
      message: "Eve accepted an internally authenticated, idempotent Production session. Task claim and completion remain unconfirmed.",
    }, { status: 202, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The internal wake-up failed. The Durable Object alarm may retry using the same idempotency key." }, { status: 502 });
  }
}
