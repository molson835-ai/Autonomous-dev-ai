import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { OWNER_SESSION_COOKIE, getVerifiedOwnerLogin, isSameOriginRequest } from "@/lib/owner-github";
import { OWNER_APPROVED_WORK_LOOP_PROMPT } from "../../../../../../agent/prompts/owner-approved-work-loop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MEMORY_API = "https://autonomous-dev-memory.molson835.workers.dev";
const REQUEST_TIMEOUT_MS = 10_000;

type QueueStatus = {
  queue_paused?: boolean;
  running_tasks?: number;
  queued_tasks?: number;
};

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Origin not allowed." }, { status: 403, headers: { "cache-control": "no-store" } });
  }

  const ownerLogin = await getVerifiedOwnerLogin();
  if (ownerLogin !== "molson835-ai") {
    return NextResponse.json({ error: "Sign in with the owner GitHub account to run Eve." }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  if (process.env.VERCEL_ENV !== "production") {
    return NextResponse.json({ error: "Run-now is available only in Production." }, { status: 409, headers: { "cache-control": "no-store" } });
  }

  const token = (await cookies()).get(OWNER_SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Owner session expired." }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  try {
    const statusResponse = await fetch(MEMORY_API + "/v1/owner/status", {
      headers: { authorization: "Bearer " + token, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!statusResponse.ok) {
      return NextResponse.json({ error: "Could not verify the Production task queue. No Eve run was started." }, { status: 502, headers: { "cache-control": "no-store" } });
    }

    const status = await statusResponse.json() as QueueStatus;
    if (status.queue_paused !== false) {
      return NextResponse.json({ error: "The task queue is paused or its status could not be verified. Resume it before starting a run." }, { status: 409, headers: { "cache-control": "no-store" } });
    }
    if (status.running_tasks !== 0) {
      return NextResponse.json({ error: "A task is already running. Wait for it to finish before starting another Eve session." }, { status: 409, headers: { "cache-control": "no-store" } });
    }
    if (typeof status.queued_tasks !== "number" || status.queued_tasks < 1) {
      return NextResponse.json({ error: "There are no queued owner-approved tasks to run." }, { status: 409, headers: { "cache-control": "no-store" } });
    }

    const eveResponse = await fetch(new URL("/eve/v1/session", request.url), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ message: OWNER_APPROVED_WORK_LOOP_PROMPT }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const payload: unknown = await eveResponse.json().catch(() => null);
    if (eveResponse.status !== 202 || !payload || typeof payload !== "object" || !("sessionId" in payload) || typeof payload.sessionId !== "string") {
      return NextResponse.json({ error: "Eve did not accept the run request. No successful start is confirmed." }, { status: 502, headers: { "cache-control": "no-store" } });
    }

    return NextResponse.json({
      accepted: true,
      session_id: payload.sessionId,
      accepted_at: new Date().toISOString(),
      message: "Eve accepted a Production session using the same bounded, owner-approved work-loop instructions as the daily schedule.",
    }, { status: 202, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The run-now request failed or timed out. Check the queue before retrying to avoid duplicate sessions." }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
