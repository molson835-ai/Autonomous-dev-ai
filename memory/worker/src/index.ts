import { DurableObject } from "cloudflare:workers";
import { isSafeMemoryText, normalizeMemoryQuery } from "../../../agent/lib/memory-policy.mjs";
import { ensureExperienceExternalIdColumn, findExperienceByExternalId } from "../../../agent/lib/memory-schema.mjs";

interface Env {
  MEMORY: DurableObjectNamespace<MemoryStore>;
  MEMORY_API_TOKEN: string;
}

type MemoryRow = {
  id: string; kind: string; content: string; source: string;
  confidence: number; status: string; created_at: string; updated_at: string;
};
type ExperienceRow = {
  id: string; external_id: string | null; task: string; outcome: string; result: string;
  evidence: string; created_at: string;
};

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

function constantTimeEqual(left: string, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 16_000) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function boundedLimit(value: string | null, fallback = 8): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(1, Math.min(20, parsed)) : fallback;
}

export class MemoryStore extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(
        "CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY, kind TEXT NOT NULL, content TEXT NOT NULL, source TEXT NOT NULL, confidence REAL NOT NULL, status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
      );
      ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS memories_status_updated ON memories(status, updated_at DESC)");
      ctx.storage.sql.exec(
        "CREATE TABLE IF NOT EXISTS experiences (id TEXT PRIMARY KEY, task TEXT NOT NULL, outcome TEXT NOT NULL, result TEXT NOT NULL CHECK (result IN ('success', 'failure', 'partial')), evidence TEXT NOT NULL, created_at TEXT NOT NULL)"
      );
      ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS experiences_created ON experiences(created_at DESC)");
      ensureExperienceExternalIdColumn(ctx.storage.sql);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const now = new Date().toISOString();

    if (request.method === "GET" && url.pathname === "/v1/experiences") {
      const externalId = url.searchParams.get("external_id");
      if (!externalId || externalId.length > 200) {
        return json({ error: "A valid external_id is required." }, 400);
      }
      const experience = findExperienceByExternalId(this.ctx.storage.sql, externalId);
      return json({ experience });
    }

    if (request.method === "GET" && url.pathname === "/v1/recall") {
      const query = normalizeMemoryQuery(url.searchParams.get("q") ?? "");
      const pattern = query ? "%" + query + "%" : "%";
      const limit = boundedLimit(url.searchParams.get("limit"));
      const memories = this.ctx.storage.sql.exec<MemoryRow>(
        "SELECT * FROM memories WHERE status = 'approved' AND content LIKE ? ORDER BY updated_at DESC LIMIT ?",
        pattern, limit
      ).toArray();
      const experiences = this.ctx.storage.sql.exec<ExperienceRow>(
        "SELECT * FROM experiences WHERE task LIKE ? OR outcome LIKE ? OR evidence LIKE ? ORDER BY created_at DESC LIMIT ?",
        pattern, pattern, pattern, limit
      ).toArray();
      return json({ memories, experiences });
    }

    if (request.method === "GET" && url.pathname === "/v1/proposals") {
      const limit = boundedLimit(url.searchParams.get("limit"), 10);
      const proposals = this.ctx.storage.sql.exec<MemoryRow>(
        "SELECT * FROM memories WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?",
        limit
      ).toArray();
      return json({ proposals });
    }

    if (request.method === "POST" && url.pathname === "/v1/experiences") {
      const body = await readBody(request);
      if (!body || !isSafeMemoryText(body.task, 1000) ||
          !isSafeMemoryText(body.outcome, 2000) ||
          !["success", "failure", "partial"].includes(String(body.result)) ||
          (body.external_id !== undefined && !isSafeMemoryText(body.external_id, 200))) {
        return json({ error: "Invalid or unsafe experience record." }, 400);
      }
      const evidence = body.evidence === undefined ? "" : body.evidence;
      if (typeof evidence !== "string" || (evidence && !isSafeMemoryText(evidence, 2000))) {
        return json({ error: "Invalid or unsafe evidence." }, 400);
      }
      const id = crypto.randomUUID();
      const externalId = typeof body.external_id === "string" ? body.external_id.trim() : null;
      try {
        this.ctx.storage.sql.exec(
          "INSERT INTO experiences (id, external_id, task, outcome, result, evidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          id, externalId, String(body.task).trim(), String(body.outcome).trim(), String(body.result), evidence.trim(), now
        );
      } catch (error) {
        if (externalId && String(error).includes("experiences.external_id")) {
          return json({ error: "An experience with this external_id already exists." }, 409);
        }
        throw error;
      }
      this.ctx.storage.sql.exec(
        "DELETE FROM experiences WHERE id IN (SELECT id FROM experiences ORDER BY created_at DESC LIMIT -1 OFFSET 500)"
      );
      return json({ id, external_id: externalId, stored: true }, 201);
    }

    if (request.method === "POST" && url.pathname === "/v1/proposals") {
      const body = await readBody(request);
      const kinds = ["fact", "procedure", "preference", "lesson"];
      if (!body || !kinds.includes(String(body.kind)) ||
          !isSafeMemoryText(body.content, 6000) ||
          !isSafeMemoryText(body.source, 2000) ||
          typeof body.confidence !== "number" || body.confidence < 0 || body.confidence > 1) {
        return json({ error: "Invalid or unsafe memory proposal." }, 400);
      }
      const pending = this.ctx.storage.sql.exec<{ count: number }>(
        "SELECT COUNT(*) AS count FROM memories WHERE status = 'pending'"
      ).one().count;
      if (pending >= 500) return json({ error: "Pending proposal limit reached; review existing proposals first." }, 429);
      const id = crypto.randomUUID();
      this.ctx.storage.sql.exec(
        "INSERT INTO memories (id, kind, content, source, confidence, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)",
        id, String(body.kind), String(body.content).trim(), String(body.source).trim(), body.confidence, now, now
      );
      return json({ id, status: "pending", stored: true }, 201);
    }

    const match = url.pathname.match(/^\/v1\/proposals\/([0-9a-f-]{36})\/decision$/i);
    if (request.method === "POST" && match) {
      const body = await readBody(request);
      if (!body || !["approve", "reject"].includes(String(body.decision))) {
        return json({ error: "Decision must be approve or reject." }, 400);
      }
      const status = body.decision === "approve" ? "approved" : "rejected";
      const result = this.ctx.storage.sql.exec(
        "UPDATE memories SET status = ?, updated_at = ? WHERE id = ? AND status = 'pending'",
        status, now, match[1]
      );
      if (result.rowsWritten === 0) return json({ error: "Pending proposal not found." }, 404);
      return json({ id: match[1], status });
    }

    return json({ error: "Not found." }, 404);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const authorization = request.headers.get("authorization") ?? "";
    const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!env.MEMORY_API_TOKEN || !constantTimeEqual(supplied, env.MEMORY_API_TOKEN)) {
      return json({ error: "Unauthorized." }, 401);
    }
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/v1/")) return json({ error: "Not found." }, 404);
    const id = env.MEMORY.idFromName("single-owner-memory");
    return env.MEMORY.get(id).fetch(request);
  },
};
