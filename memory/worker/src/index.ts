import { DurableObject } from "cloudflare:workers";
import { isSafeMemoryText, normalizeMemoryQuery } from "../../../agent/lib/memory-policy.mjs";
import { ensureExperienceExternalIdColumn, findExperienceByExternalId } from "../../../agent/lib/memory-schema.mjs";
import { createTaskRecord, selectNextTask, TASK_STATUS_VALUES, transitionTask } from "../../../agent/lib/task-lifecycle.mjs";

interface Env {
  MEMORY: DurableObjectNamespace<MemoryStore>;
  MEMORY_API_TOKEN: string;
  TASK_OWNER_APPROVAL_TOKEN?: string;
}

type MemoryRow = {
  id: string; kind: string; content: string; source: string;
  confidence: number; status: string; created_at: string; updated_at: string;
};
type TaskRow = { id: string; idempotency_key: string; task_type: string; title: string; goal: string; approved_scope: string; status: string; owner_approved: number; created_at: string; updated_at: string; attempt_count: number; max_attempts: number; next_run_at: string | null; checkpoint_summary: string | null; result_summary: string | null; evidence_refs: string; started_at: string | null; finished_at: string | null; };
type ExperienceRow = {
  id: string; external_id: string | null; task: string; outcome: string; result: string;
  evidence: string; created_at: string;
};

function taskFromRow(row: TaskRow) {
  let evidenceRefs: string[] = [];
  try { const parsed: unknown = JSON.parse(row.evidence_refs); if (Array.isArray(parsed) && parsed.every(item => typeof item === "string")) evidenceRefs = parsed; } catch { /* Fail closed on malformed evidence metadata. */ }
  return { ...row, owner_approved: row.owner_approved === 1, evidence_refs: evidenceRefs };
}

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
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE, task_type TEXT NOT NULL, title TEXT NOT NULL, goal TEXT NOT NULL, approved_scope TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('proposed','queued','running','waiting','paused','succeeded','failed','cancelled')), owner_approved INTEGER NOT NULL CHECK (owner_approved IN (0,1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, attempt_count INTEGER NOT NULL, max_attempts INTEGER NOT NULL CHECK (max_attempts BETWEEN 1 AND 3), next_run_at TEXT, checkpoint_summary TEXT, result_summary TEXT, evidence_refs TEXT NOT NULL DEFAULT '[]', started_at TEXT, finished_at TEXT)");
      ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS tasks_status_created ON tasks(status, created_at)");
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const now = new Date().toISOString();



    if (request.method === "POST" && url.pathname === "/v1/tasks") {
      const body = await readBody(request);
      const allowed = new Set(["idempotency_key", "task_type", "title", "goal", "approved_scope"]);
      if (!body || Object.keys(body).some(key => !allowed.has(key)) ||
          !isSafeMemoryText(body.idempotency_key, 200) || !isSafeMemoryText(body.task_type, 80) ||
          !isSafeMemoryText(body.title, 200) || !isSafeMemoryText(body.goal, 1000) ||
          !isSafeMemoryText(body.approved_scope, 2000)) return json({ error: "Invalid task proposal." }, 400);
      const key = String(body.idempotency_key).trim();
      const existing = this.ctx.storage.sql.exec<TaskRow>("SELECT * FROM tasks WHERE idempotency_key = ? LIMIT 1", key).toArray()[0];
      if (existing) return json({ task: taskFromRow(existing), created: false });
      const task = createTaskRecord({ id: crypto.randomUUID(), idempotency_key: key, task_type: String(body.task_type).trim(), title: String(body.title).trim(), goal: String(body.goal).trim(), approved_scope: String(body.approved_scope).trim() }, { now });
      this.ctx.storage.sql.exec("INSERT INTO tasks (id,idempotency_key,task_type,title,goal,approved_scope,status,owner_approved,created_at,updated_at,attempt_count,max_attempts,next_run_at,checkpoint_summary,result_summary,evidence_refs,started_at,finished_at) VALUES (?,?,?,?,?,?,?,0,?,?,0,?,NULL,NULL,NULL,'[]',NULL,NULL)", task.id, task.idempotency_key, task.task_type, task.title, task.goal, task.approved_scope, task.status, task.created_at, task.updated_at, task.max_attempts);
      return json({ task, created: true }, 201);
    }

    if (request.method === "GET" && url.pathname === "/v1/tasks") {
      const limit = boundedLimit(url.searchParams.get("limit"), 20);
      const rows = this.ctx.storage.sql.exec<TaskRow>("SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?", limit).toArray();
      return json({ tasks: rows.map(taskFromRow) });
    }

    const taskMatch = url.pathname.match(/^\/v1\/tasks\/([0-9a-f-]{36})$/i);
    if (request.method === "GET" && taskMatch) {
      const row = this.ctx.storage.sql.exec<TaskRow>("SELECT * FROM tasks WHERE id = ? LIMIT 1", taskMatch[1]).toArray()[0];
      return row ? json({ task: taskFromRow(row) }) : json({ error: "Task not found." }, 404);
    }

    const approveMatch = url.pathname.match(/^\/v1\/tasks\/([0-9a-f-]{36})\/approve$/i);
    if (request.method === "POST" && approveMatch) {
      const row = this.ctx.storage.sql.exec<TaskRow>("SELECT * FROM tasks WHERE id = ? LIMIT 1", approveMatch[1]).toArray()[0];
      if (!row) return json({ error: "Task not found." }, 404);
      const current = taskFromRow(row);
      if (current.status !== "proposed") return json({ error: "Only proposed tasks can be approved." }, 409);
      const approved = transitionTask(current, "queued", { ownerApproved: true, now });
      const updated = this.ctx.storage.sql.exec("UPDATE tasks SET status='queued', owner_approved=1, updated_at=? WHERE id=? AND status='proposed' AND owner_approved=0", now, current.id);
      if (updated.rowsWritten !== 1) return json({ error: "Task approval state conflict." }, 409);
      return json({ task: approved });
    }

    if (request.method === "POST" && url.pathname === "/v1/tasks/claim-next") {
      const running = this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM tasks WHERE status='running'").one().count;
      if (running > 0) return json({ task: null });
      const rows = this.ctx.storage.sql.exec<TaskRow>("SELECT * FROM tasks WHERE status='queued' ORDER BY created_at ASC LIMIT 500").toArray();
      const selected = selectNextTask(rows.map(taskFromRow), { now: Date.parse(now) });
      if (!selected) return json({ task: null });
      const claimed = transitionTask(selected, "running", { now });
      const updated = this.ctx.storage.sql.exec("UPDATE tasks SET status='running', attempt_count=?, updated_at=?, started_at=COALESCE(started_at,?) WHERE id=? AND status='queued' AND owner_approved=1 AND attempt_count<max_attempts", claimed.attempt_count, now, now, selected.id);
      if (updated.rowsWritten !== 1) return json({ error: "Task claim state conflict." }, 409);
      return json({ task: claimed });
    }

    const ownerControlMatch = url.pathname.match(/^\/v1\/tasks\/([0-9a-f-]{36})\/owner-control$/i);
    if (request.method === "POST" && ownerControlMatch) {
      const body = await readBody(request);
      if (!body || Object.keys(body).some(key => key !== "action") || !["pause", "resume"].includes(String(body.action))) {
        return json({ error: "Invalid owner task control." }, 400);
      }
      const row = this.ctx.storage.sql.exec<TaskRow>("SELECT * FROM tasks WHERE id=? LIMIT 1", ownerControlMatch[1]).toArray()[0];
      if (!row) return json({ error: "Task not found." }, 404);
      const current = taskFromRow(row);
      const nextStatus = body.action === "pause" ? "paused" : "queued";
      let next;
      try { next = transitionTask(current, nextStatus, { now, ownerApproved: body.action === "resume" }); }
      catch { return json({ error: "Invalid task state transition." }, 409); }
      const updated = this.ctx.storage.sql.exec<{ id: string }>("UPDATE tasks SET status=?, owner_approved=?, updated_at=?, next_run_at=NULL WHERE id=? AND status=? RETURNING id", next.status, next.owner_approved ? 1 : 0, now, current.id, current.status).toArray();
      if (updated.length !== 1) return json({ error: "Task state conflict." }, 409);
      return json({ task: next });
    }

    const transitionMatch = url.pathname.match(/^\/v1\/tasks\/([0-9a-f-]{36})\/transition$/i);
    if (request.method === "POST" && transitionMatch) {
      const body = await readBody(request);
      if (!body || Object.keys(body).some(key => !["status","checkpoint_summary","result_summary","evidence_refs"].includes(key)) || !TASK_STATUS_VALUES.includes(String(body.status))) return json({ error: "Invalid task transition." }, 400);
      if (body.checkpoint_summary !== undefined && body.checkpoint_summary !== null && !isSafeMemoryText(body.checkpoint_summary, 2000)) return json({ error: "Invalid checkpoint summary." }, 400);
      if (body.result_summary !== undefined && body.result_summary !== null && !isSafeMemoryText(body.result_summary, 4000)) return json({ error: "Invalid result summary." }, 400);
      if (body.evidence_refs !== undefined && (!Array.isArray(body.evidence_refs) || body.evidence_refs.length > 20 || !body.evidence_refs.every(item => typeof item === "string" && isSafeMemoryText(item, 500)))) return json({ error: "Invalid evidence references." }, 400);
      const row = this.ctx.storage.sql.exec<TaskRow>("SELECT * FROM tasks WHERE id=? LIMIT 1", transitionMatch[1]).toArray()[0];
      if (!row) return json({ error: "Task not found." }, 404);
      const current = taskFromRow(row);
      if (current.status === "paused" && body.status === "queued") return json({ error: "Owner approval is required to resume a paused task." }, 409);
      let next;
      try { next = transitionTask(current, String(body.status), { now, checkpointSummary: body.checkpoint_summary, resultSummary: body.result_summary, evidenceRefs: body.evidence_refs }); }
      catch (error) { return json({ error: String(error).includes("owner_approval_required") ? "Owner approval is required." : "Invalid task state transition." }, 409); }
      const update = this.ctx.storage.sql.exec("UPDATE tasks SET status=?,owner_approved=?,updated_at=?,attempt_count=?,next_run_at=?,checkpoint_summary=?,result_summary=?,evidence_refs=?,started_at=?,finished_at=? WHERE id=? AND status=?", next.status, next.owner_approved ? 1 : 0, next.updated_at, next.attempt_count, next.next_run_at, next.checkpoint_summary, next.result_summary, JSON.stringify(next.evidence_refs), next.started_at ?? null, next.finished_at ?? null, current.id, current.status);
      if (update.rowsWritten !== 1) return json({ error: "Task state conflict." }, 409);
      return json({ task: next });
    }

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
    const url = new URL(request.url);
    const ownerApprovalRoute = request.method === "POST" && /^\/v1\/tasks\/[0-9a-f-]{36}\/approve$/i.test(url.pathname);
    const ownerControlRoute = request.method === "POST" && /^\/v1\/tasks\/[0-9a-f-]{36}\/owner-control$/i.test(url.pathname);
    const ownerOnlyRoute = ownerApprovalRoute || ownerControlRoute;
    const expectedToken = ownerOnlyRoute ? (env.TASK_OWNER_APPROVAL_TOKEN ?? "") : env.MEMORY_API_TOKEN;
    if (ownerOnlyRoute && (!expectedToken || expectedToken === env.MEMORY_API_TOKEN)) return json({ error: "Owner approval is not configured." }, 503);
    if (!expectedToken || !constantTimeEqual(supplied, expectedToken)) return json({ error: "Unauthorized." }, 401);
    if (!url.pathname.startsWith("/v1/")) return json({ error: "Not found." }, 404);
    const id = env.MEMORY.idFromName("single-owner-memory");
    return env.MEMORY.get(id).fetch(request);
  },
};
