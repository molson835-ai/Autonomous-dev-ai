import { get } from "@vercel/blob";
import { createHmac, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DownloadPayload = { p: string; n: string; t: string; e: number };

const CONTENT_TYPES = new Set([
  "text/html; charset=utf-8",
  "image/svg+xml",
  "image/png",
  "audio/wav",
  "video/mp4",
]);

function verifyToken(token: string, secret: string): DownloadPayload | null {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra !== undefined) return null;
  const expected = createHmac("sha256", secret).update(encoded).digest();
  let received: Buffer;
  try { received = Buffer.from(signature, "base64url"); } catch { return null; }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as DownloadPayload;
    if (
      typeof payload.p !== "string" ||
      !payload.p.startsWith("eve-artifacts/") ||
      payload.p.includes("..") ||
      typeof payload.n !== "string" ||
      typeof payload.t !== "string" ||
      !CONTENT_TYPES.has(payload.t) ||
      !["attachment", "inline"].includes(payload.d) ||
      !Number.isInteger(payload.e) ||
      payload.e <= Math.floor(Date.now() / 1000)
    ) return null;
    return payload;
  } catch { return null; }
}

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.ARTIFACT_LINK_SECRET;
  const token = new URL(request.url).searchParams.get("token");
  if (!secret || !token) return new Response("Not found", { status: 404 });
  const payload = verifyToken(token, secret);
  if (!payload) return new Response("This download link is invalid or has expired.", { status: 410 });

  try {
    const blob = await get(payload.p, { access: "private" });
    if (!blob || blob.statusCode !== 200) return new Response("Artifact not found.", { status: 404 });
    const filename = payload.n.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "eve-artifact";
    return new Response(blob.stream as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": payload.t,
        "Content-Disposition": `${payload.d}; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch {
    return new Response("Artifact storage is temporarily unavailable.", { status: 503 });
  }
}
