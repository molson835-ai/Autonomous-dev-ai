import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { OWNER_GITHUB_ID, OWNER_SESSION_COOKIE, getVerifiedOwnerLogin, isSameOriginRequest } from "@/lib/owner-github";

export const runtime = "nodejs";
const MEMORY_API = "https://autonomous-dev-memory.molson835.workers.dev";

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  if (request.method !== "GET" && request.method !== "POST") return NextResponse.json({ error: "Method not allowed." }, { status: 405 });
  if (request.method === "POST" && !isSameOriginRequest(request)) return NextResponse.json({ error: "Origin not allowed." }, { status: 403 });
  const login = await getVerifiedOwnerLogin();
  if (!login) return NextResponse.json({ error: "Sign in with the owner GitHub account to continue." }, { status: 401 });

  const { path } = await context.params;
  const workerPath = "/" + path.join("/");
  const allowedGet = ["/v1/owner/tasks", "/v1/owner/proposals", "/v1/owner/status"];
  const allowedPost = ["/v1/owner/control"];
  const taskAction = /^\/v1\/tasks\/[0-9a-f-]{36}\/(approve|owner-control)$/i.test(workerPath);
  const proposalAction = /^\/v1\/proposals\/[0-9a-f-]{36}\/decision$/i.test(workerPath);
  if (request.method === "GET" ? !allowedGet.includes(workerPath) : !(allowedPost.includes(workerPath) || taskAction || proposalAction)) {
    return NextResponse.json({ error: "Owner route not allowed." }, { status: 404 });
  }

  const cookieToken = (await cookies()).get(OWNER_SESSION_COOKIE)?.value;
  if (!cookieToken) return NextResponse.json({ error: "Owner session expired." }, { status: 401 });
  const signingSecret = process.env.OWNER_SESSION_SIGNING_SECRET;
  if (!signingSecret || signingSecret.length < 32) {
    return NextResponse.json({ error: "Owner-to-Worker signing is not configured." }, { status: 503 });
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: "eve-owner-console",
    aud: "eve-memory-worker",
    sub: String(OWNER_GITHUB_ID),
    iat: issuedAt,
    exp: issuedAt + 300,
  })).toString("base64url");
  const signature = createHmac("sha256", signingSecret).update(payload).digest("base64url");
  const workerSession = payload + "." + signature;
  const incomingUrl = new URL(request.url);
  const target = new URL(workerPath + incomingUrl.search, MEMORY_API);
  const headers = new Headers({ authorization: "Bearer " + workerSession });
  let body: string | undefined;
  if (request.method === "POST") {
    const raw = await request.text();
    if (raw.length > 16_384) return NextResponse.json({ error: "Request body too large." }, { status: 413 });
    if (raw.length > 0) {
      body = raw;
      headers.set("content-type", "application/json");
    }
  }
  try {
    const upstream = await fetch(target, { method: request.method, headers, body, cache: "no-store" });
    const payload = await upstream.text();
    return new Response(payload, { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Owner service is temporarily unavailable." }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
