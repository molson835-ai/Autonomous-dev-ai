import { DurableObject } from "cloudflare:workers";
import { compareOwnerClientId, diagnosticSharedSecretReason, ownerAuthConfigurationReason, verifyOwnerGithubToken, type OwnerAuthReasonCode } from "./owner-auth";
import { isSafeMemoryText, normalizeMemoryQuery } from "../../../agent/lib/memory-policy.mjs";
import { validateHtmlArtifact } from "../../../agent/lib/artifact-policy.mjs";
import { validateCsvArtifact } from "../../../agent/lib/csv-artifact-policy.mjs";
import { prepareResourceCandidate } from "../../../agent/resources/intake.mjs";
import { ensureExperienceExternalIdColumn, findExperienceByExternalId } from "../../../agent/lib/memory-schema.mjs";
import { createTaskRecord, isMissionAuthorizedTask, isTaskLeaseExpired, selectNextTask, TASK_STATUS_VALUES, transitionTask } from "../../../agent/lib/task-lifecycle.mjs";

interface Env {
  MEMORY: DurableObjectNamespace<MemoryStore>;
  MEMORY_API_TOKEN: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  OWNER_GITHUB_ID?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_ANALYTICS_API_TOKEN?: string;
}

type ArtifactRow = { id: string; name: string; filename: string; media_type: string; content: string; bytes: number; created_at: string; idempotency_key: string | null; sha256: string | null; };
const MAX_ARTIFACT_COUNT = 20;
const MAX_ARTIFACT_TOTAL_BYTES = 1_048_576;
const MAX_ARTIFACT_REQUEST_BYTES = 160_000;

type MemoryRow = {
  id: string; kind: string; content: string; source: string;
  confidence: number; status: string; created_at: string; updated_at: string;
};
type TaskRow = { id: string; idempotency_key: string; task_type: string; title: string; goal: string; approved_scope: string; scope_id: string; status: string; owner_approved: number; mission_authorized: number; created_at: string; updated_at: string; attempt_count: number; max_attempts: number; step_count: number; max_steps: number; next_run_at: string | null; checkpoint_summary: string | null; result_summary: string | null; evidence_refs: string; started_at: string | null; finished_at: string | null; };
type ResourceRow = { id: string; resource_json: string; trust_state: string; created_at: string; updated_at: string; reviewer: string | null; reviewed_at: string | null; review_evidence: string; };
type ExperienceRow = {
  id: string; external_id: string | null; task: string; outcome: string; result: string;
  evidence: string; created_at: string;
};

function taskFromRow(row: TaskRow) {
  let evidenceRefs: string[] = [];
  try { const parsed: unknown = JSON.parse(row.evidence_refs); if (Array.isArray(parsed) && parsed.every(item => typeof item === "string")) evidenceRefs = parsed; } catch { /* Fail closed on malformed evidence metadata. */ }
  return { ...row, owner_approved: row.owner_approved === 1, mission_authorized: row.mission_authorized === 1, evidence_refs: evidenceRefs };
}

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

function constantTimeEqual(left: string, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

async function readBody(request: Request, maxBytes = 16_000): Promise<Record<string, unknown> | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (total + value.byteLength > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
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
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE, task_type TEXT NOT NULL, title TEXT NOT NULL, goal TEXT NOT NULL, approved_scope TEXT NOT NULL, scope_id TEXT NOT NULL DEFAULT 'owner_review_required', status TEXT NOT NULL CHECK (status IN ('proposed','queued','running','waiting','paused','succeeded','failed','cancelled')), owner_approved INTEGER NOT NULL CHECK (owner_approved IN (0,1)), mission_authorized INTEGER NOT NULL DEFAULT 0 CHECK (mission_authorized IN (0,1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, attempt_count INTEGER NOT NULL, max_attempts INTEGER NOT NULL CHECK (max_attempts BETWEEN 1 AND 3), step_count INTEGER NOT NULL DEFAULT 0, max_steps INTEGER NOT NULL DEFAULT 10 CHECK (max_steps BETWEEN 1 AND 10), next_run_at TEXT, checkpoint_summary TEXT, result_summary TEXT, evidence_refs TEXT NOT NULL DEFAULT '[]', started_at TEXT, finished_at TEXT)");
      const taskColumns = ctx.storage.sql.exec<{ name: string }>("PRAGMA table_info(tasks)").toArray();
      if (!taskColumns.some(column => column.name === "step_count")) {
        ctx.storage.sql.exec("ALTER TABLE tasks ADD COLUMN step_count INTEGER NOT NULL DEFAULT 0");
        ctx.storage.sql.exec("UPDATE tasks SET step_count=attempt_count, attempt_count=0");
      }
      if (!taskColumns.some(column => column.name === "max_steps")) {
        ctx.storage.sql.exec("ALTER TABLE tasks ADD COLUMN max_steps INTEGER NOT NULL DEFAULT 10 CHECK (max_steps BETWEEN 1 AND 10)");
        ctx.storage.sql.exec("UPDATE tasks SET max_steps=10 WHERE status IN ('proposed','queued','running','waiting','paused')");
      }
      if (!taskColumns.some(column => column.name === "mission_authorized")) {
        ctx.storage.sql.exec("ALTER TABLE tasks ADD COLUMN mission_authorized INTEGER NOT NULL DEFAULT 0 CHECK (mission_authorized IN (0,1))");
      }
      if (!taskColumns.some(column => column.name === "scope_id")) {
        ctx.storage.sql.exec("ALTER TABLE tasks ADD COLUMN scope_id TEXT NOT NULL DEFAULT 'owner_review_required'");
      }
      // Revoke all legacy mission authorization until trusted owner delegation exists.
      // Preserve history; stop every nonterminal unapproved task by returning it to proposed.
      ctx.storage.sql.exec(
        "UPDATE tasks SET mission_authorized=0, status=CASE WHEN owner_approved=0 AND status NOT IN ('succeeded','failed','cancelled') THEN 'proposed' ELSE status END, updated_at=? WHERE mission_authorized=1",
        new Date().toISOString()
      );
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS task_control (id INTEGER PRIMARY KEY CHECK (id=1), queue_paused INTEGER NOT NULL CHECK (queue_paused IN (0,1)), reason TEXT, updated_at TEXT NOT NULL)");
      ctx.storage.sql.exec("INSERT OR IGNORE INTO task_control (id,queue_paused,reason,updated_at) VALUES (1,0,NULL,?)", new Date().toISOString());
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS quota_daily (day TEXT PRIMARY KEY, baseline_neurons REAL NOT NULL, observed_neurons REAL NOT NULL, observed_at TEXT NOT NULL, local_estimated_neurons REAL NOT NULL DEFAULT 0, circuit_open INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)");
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS quota_reservations (id TEXT PRIMARY KEY, day TEXT NOT NULL, reserved_neurons REAL NOT NULL, created_at TEXT NOT NULL)");
      ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS quota_reservations_day ON quota_reservations(day)");
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS quota_call_ledger (reservation_id TEXT PRIMARY KEY, day TEXT NOT NULL, settled_at TEXT NOT NULL, model_id TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER, estimated_neurons REAL NOT NULL, accounting_source TEXT NOT NULL CHECK (accounting_source IN ('provider_usage','fallback')), settlement_reason TEXT NOT NULL)");
      ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS quota_call_ledger_day_settled ON quota_call_ledger(day, settled_at DESC)");
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS tavily_credit_monthly (month TEXT PRIMARY KEY, used_credits REAL NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)");
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS tavily_credit_reservations (id TEXT PRIMARY KEY, month TEXT NOT NULL, reserved_credits REAL NOT NULL, created_at TEXT NOT NULL)");
      ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS tavily_credit_reservations_month ON tavily_credit_reservations(month)");
      ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS tasks_status_created ON tasks(status, created_at)");
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS task_wakeup_attempts (operation_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, next_run_at TEXT NOT NULL, attempted_at TEXT NOT NULL)");
      ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS task_wakeup_attempts_task ON task_wakeup_attempts(task_id, next_run_at)");
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS resources (id TEXT PRIMARY KEY, resource_json TEXT NOT NULL, trust_state TEXT NOT NULL CHECK (trust_state IN ('quarantined','reviewed','approved','rejected','stale')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, reviewer TEXT, reviewed_at TEXT, review_evidence TEXT NOT NULL DEFAULT '[]')");
      ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS resources_state_updated ON resources(trust_state, updated_at DESC)");
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, name TEXT NOT NULL, filename TEXT NOT NULL, media_type TEXT NOT NULL CHECK (media_type = 'text/html'), content TEXT NOT NULL, bytes INTEGER NOT NULL CHECK (bytes BETWEEN 1 AND 70000), created_at TEXT NOT NULL, idempotency_key TEXT, sha256 TEXT)");
      const artifactColumns = ctx.storage.sql.exec<{ name: string }>("PRAGMA table_info(artifacts)").toArray();
      if (!artifactColumns.some(column => column.name === "idempotency_key")) ctx.storage.sql.exec("ALTER TABLE artifacts ADD COLUMN idempotency_key TEXT");
      if (!artifactColumns.some(column => column.name === "sha256")) ctx.storage.sql.exec("ALTER TABLE artifacts ADD COLUMN sha256 TEXT");
      ctx.storage.sql.exec("CREATE UNIQUE INDEX IF NOT EXISTS artifacts_idempotency_key ON artifacts(idempotency_key) WHERE idempotency_key IS NOT NULL");
      ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS artifacts_created ON artifacts(created_at DESC)");
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS csv_artifacts (id TEXT PRIMARY KEY, name TEXT NOT NULL, filename TEXT NOT NULL, media_type TEXT NOT NULL CHECK (media_type = 'text/csv; charset=utf-8'), content TEXT NOT NULL, bytes INTEGER NOT NULL CHECK (bytes BETWEEN 1 AND 65536), created_at TEXT NOT NULL, idempotency_key TEXT, sha256 TEXT)");
      ctx.storage.sql.exec("CREATE UNIQUE INDEX IF NOT EXISTS csv_artifacts_idempotency_key ON csv_artifacts(idempotency_key) WHERE idempotency_key IS NOT NULL");
      ctx.storage.sql.exec("CREATE INDEX IF NOT EXISTS csv_artifacts_created ON csv_artifacts(created_at DESC)");
      await this.scheduleTaskWakeup();
    });
  }

  private async scheduleTaskWakeup(): Promise<void> {
    const control = this.ctx.storage.sql.exec<{ queue_paused: number }>("SELECT queue_paused FROM task_control WHERE id=1").one();
    const running = this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM tasks WHERE status='running'").one().count;
    if (control.queue_paused === 1 || running > 0) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const next = this.ctx.storage.sql.exec<{ next_run_at: string }>(
      "SELECT MIN(t.next_run_at) AS next_run_at FROM tasks t WHERE t.status='waiting' AND t.owner_approved=1 AND t.mission_authorized=0 AND t.attempt_count<t.max_attempts AND t.step_count<t.max_steps AND t.next_run_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM task_wakeup_attempts w WHERE w.task_id=t.id AND w.next_run_at=t.next_run_at)"
    ).toArray()[0];
    if (!next?.next_run_at) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const dueAt = Date.parse(next.next_run_at);
    if (!Number.isFinite(dueAt)) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, dueAt));
  }

  async alarm(): Promise<void> {
    const now = new Date().toISOString();
    const control = this.ctx.storage.sql.exec<{ queue_paused: number }>("SELECT queue_paused FROM task_control WHERE id=1").one();
    const running = this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM tasks WHERE status='running'").one().count;
    if (control.queue_paused === 1 || running > 0) {
      await this.scheduleTaskWakeup();
      return;
    }
    const due = this.ctx.storage.sql.exec<TaskRow>(
      "SELECT t.* FROM tasks t WHERE t.status='waiting' AND t.owner_approved=1 AND t.mission_authorized=0 AND t.attempt_count<t.max_attempts AND t.step_count<t.max_steps AND t.next_run_at IS NOT NULL AND t.next_run_at<=? AND NOT EXISTS (SELECT 1 FROM task_wakeup_attempts w WHERE w.task_id=t.id AND w.next_run_at=t.next_run_at) ORDER BY t.next_run_at ASC LIMIT 1",
      now
    ).toArray()[0];
    if (!due) {
      await this.scheduleTaskWakeup();
      return;
    }
    if (!this.env.MEMORY_API_TOKEN) throw new Error("Task wake-up credential is not configured.");
    const operationId = `eve-task-${due.id}-${Date.parse(due.next_run_at ?? now)}`;
    const recorded = this.ctx.storage.sql.exec<{ operation_id: string }>(
      "INSERT OR IGNORE INTO task_wakeup_attempts (operation_id,task_id,next_run_at,attempted_at) VALUES (?,?,?,?) RETURNING operation_id",
      operationId, due.id, due.next_run_at ?? now, now
    ).toArray();
    if (recorded.length !== 1) {
      await this.scheduleTaskWakeup();
      return;
    }
    const response = await fetch("https://autonomous-dev-ai.vercel.app/api/internal/task-wakeup", {
      method: "POST",
      headers: {
        authorization: "Bearer " + this.env.MEMORY_API_TOKEN,
        "content-type": "application/json",
      },
      body: JSON.stringify({ task_id: due.id, next_run_at: due.next_run_at, operation_id: operationId }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status >= 500 || response.status === 429) {
      throw new Error("Task wake-up endpoint returned a retryable server response.");
    }
    if (!response.ok) {
      console.error("Eve task wake-up was rejected; the daily schedule remains the fallback.", {
        taskId: due.id,
        status: response.status,
      });
      return;
    }
    const payload: unknown = await response.json().catch(() => null);
    if (payload && typeof payload === "object" && "accepted" in payload && payload.accepted === false && "skipped" in payload && payload.skipped === true) {
      // No session was started. Release the one-shot guard so a later owner
      // resume can schedule this checkpoint again.
      this.ctx.storage.sql.exec("DELETE FROM task_wakeup_attempts WHERE operation_id=?", operationId);
      await this.scheduleTaskWakeup();
      return;
    }
    if (!payload || typeof payload !== "object" || !("accepted" in payload) || payload.accepted !== true) {
      await this.scheduleTaskWakeup();
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const now = new Date().toISOString();

    if (request.method === "GET" && url.pathname === "/v1/internal/wakeup-status") {
      const taskId = url.searchParams.get("task_id") ?? "";
      const expectedNextRunAt = url.searchParams.get("next_run_at") ?? "";
      if (!/^[0-9a-f-]{36}$/i.test(taskId) || !Number.isFinite(Date.parse(expectedNextRunAt))) {
        return json({ error: "Invalid wake-up status query." }, 400);
      }
      const control = this.ctx.storage.sql.exec<{ queue_paused: number }>("SELECT queue_paused FROM task_control WHERE id=1").one();
      const running = this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM tasks WHERE status='running'").one().count;
      const row = this.ctx.storage.sql.exec<TaskRow>("SELECT * FROM tasks WHERE id=? LIMIT 1", taskId).toArray()[0];
      const task = row ? taskFromRow(row) : null;
      const eligible = control.queue_paused === 0 && running === 0 && !!task &&
        task.status === "waiting" && task.owner_approved === true && task.mission_authorized === false &&
        task.attempt_count < task.max_attempts && task.step_count < task.max_steps &&
        task.next_run_at === expectedNextRunAt && Date.parse(expectedNextRunAt) <= Date.parse(now);
      return json({ eligible, queue_paused: control.queue_paused === 1, running_tasks: running });
    }

    if (request.method === "POST" && url.pathname === "/v1/research/credits/reserve") {
      const body = await readBody(request);
      const month = now.slice(0, 7);
      if (!body || Object.keys(body).some(key => key !== "credits") || body.credits !== 1) return json({ error: "A single basic-search credit reservation is required." }, 400);
      const stale = this.ctx.storage.sql.exec<{ id: string; month: string; reserved_credits: number }>(
        "SELECT id,month,reserved_credits FROM tavily_credit_reservations WHERE created_at < ?",
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      ).toArray();
      for (const item of stale) {
        this.ctx.storage.sql.exec("INSERT INTO tavily_credit_monthly (month,used_credits,updated_at) VALUES (?,?,?) ON CONFLICT(month) DO UPDATE SET used_credits=used_credits+excluded.used_credits,updated_at=excluded.updated_at", item.month, item.reserved_credits, now);
        this.ctx.storage.sql.exec("DELETE FROM tavily_credit_reservations WHERE id=?", item.id);
      }
      const used = this.ctx.storage.sql.exec<{ used_credits: number }>("SELECT used_credits FROM tavily_credit_monthly WHERE month=? LIMIT 1", month).toArray()[0]?.used_credits ?? 0;
      const reserved = this.ctx.storage.sql.exec<{ total: number }>("SELECT COALESCE(SUM(reserved_credits),0) AS total FROM tavily_credit_reservations WHERE month=?", month).one().total;
      const limit = 800;
      if (used + reserved + 1 > limit) return json({ error: "Eve's monthly Tavily safety budget is exhausted. No search request was sent.", reason_code: "tavily_monthly_credit_budget_reached", month, used_credits: used, reserved_credits: reserved, monthly_limit: limit }, 429);
      const id = crypto.randomUUID();
      this.ctx.storage.sql.exec("INSERT INTO tavily_credit_reservations (id,month,reserved_credits,created_at) VALUES (?,?,1,?)", id, month, now);
      return json({ reservation_id: id, month, reserved_credits: 1, used_credits: used, monthly_limit: limit });
    }
    if (request.method === "GET" && url.pathname === "/v1/owner/research/credits/status") {
      const month = now.slice(0, 7);
      const monthly = this.ctx.storage.sql.exec<{ used_credits: number; updated_at: string }>(
        "SELECT used_credits,updated_at FROM tavily_credit_monthly WHERE month=? LIMIT 1", month
      ).toArray()[0];
      const pending = this.ctx.storage.sql.exec<{ total: number; count: number; oldest_created_at: string | null }>(
        "SELECT COALESCE(SUM(reserved_credits),0) AS total,COUNT(*) AS count,MIN(created_at) AS oldest_created_at FROM tavily_credit_reservations WHERE month=?", month
      ).one();
      return json({
        month,
        source: "eve_durable_object_ledger_not_provider_account_telemetry",
        monthly_limit: 800,
        used_credits: monthly?.used_credits ?? 0,
        reserved_credits: pending.total,
        outstanding_reservations: pending.count,
        oldest_outstanding_reservation_at: pending.oldest_created_at,
        remaining_budget: Math.max(0, 800 - (monthly?.used_credits ?? 0) - pending.total),
        updated_at: monthly?.updated_at ?? null,
      });
    }
    if (request.method === "POST" && url.pathname === "/v1/research/credits/settle") {
      const body = await readBody(request);
      if (!body || Object.keys(body).some(key => !["reservation_id","actual_credits"].includes(key)) ||
          typeof body.reservation_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.reservation_id) ||
          (body.actual_credits !== undefined && (typeof body.actual_credits !== "number" || !Number.isFinite(body.actual_credits) || body.actual_credits < 0 || body.actual_credits > 10))) return json({ error: "Invalid Tavily credit settlement." }, 400);
      const reservation = this.ctx.storage.sql.exec<{ id: string; month: string; reserved_credits: number }>("SELECT * FROM tavily_credit_reservations WHERE id=? LIMIT 1", body.reservation_id).toArray()[0];
      if (!reservation) return json({ error: "Tavily credit reservation not found or already settled." }, 404);
      const charged = body.actual_credits === undefined ? reservation.reserved_credits : body.actual_credits;
      this.ctx.storage.sql.exec("INSERT INTO tavily_credit_monthly (month,used_credits,updated_at) VALUES (?,?,?) ON CONFLICT(month) DO UPDATE SET used_credits=used_credits+excluded.used_credits,updated_at=excluded.updated_at", reservation.month, charged, now);
      this.ctx.storage.sql.exec("DELETE FROM tavily_credit_reservations WHERE id=?", reservation.id);
      return json({ settled: true, month: reservation.month, charged_credits: charged });
    }
    if (request.method === "GET" && url.pathname === "/v1/owner/quota/calls") {
      const limit = boundedLimit(url.searchParams.get("limit"), 50);
      const day = url.searchParams.get("day") ?? now.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error: "Invalid quota ledger day." }, 400);
      const calls = this.ctx.storage.sql.exec<{
        reservation_id:string; day:string; settled_at:string; model_id:string; input_tokens:number|null;
        output_tokens:number|null; estimated_neurons:number; accounting_source:string; settlement_reason:string;
      }>("SELECT reservation_id,day,settled_at,model_id,input_tokens,output_tokens,estimated_neurons,accounting_source,settlement_reason FROM quota_call_ledger WHERE day=? ORDER BY settled_at DESC, rowid DESC LIMIT ?", day, limit).toArray();
      return json({ day, source: "eve_durable_object_per_call_estimate_ledger_not_provider_account_telemetry", retention_days: 30, count: calls.length, calls });
    }
    if (request.method === "GET" && ["/v1/quota/status", "/v1/owner/quota/status"].includes(url.pathname)) {
      const day = now.slice(0, 10);
      const daily = this.ctx.storage.sql.exec<{
        day: string; baseline_neurons: number; observed_neurons: number;
        observed_at: string; local_estimated_neurons: number; circuit_open: number; updated_at: string;
      }>("SELECT * FROM quota_daily WHERE day=? LIMIT 1", day).toArray()[0];
      const active = this.ctx.storage.sql.exec<{ total: number }>(
        "SELECT COALESCE(SUM(reserved_neurons),0) AS total FROM quota_reservations WHERE day=?", day
      ).one().total;
      const projected = daily
        ? Math.max(daily.observed_neurons, daily.baseline_neurons + daily.local_estimated_neurons) + active
        : active;
      return json({
        day,
        source: "local_model_estimate_not_provider_telemetry",
        target_neurons: 7000,
        protected_reserve_neurons: 3000,
        observed_neurons: daily?.observed_neurons ?? null,
        observed_at: daily?.observed_at ?? null,
        local_estimated_neurons: daily?.local_estimated_neurons ?? 0,
        active_reserved_neurons: active,
        projected_neurons: projected,
        remaining_to_target: Math.max(0, 7000 - projected),
        circuit_open: daily?.circuit_open === 1,
        model_calls_allowed: daily?.circuit_open !== 1 && projected + 200 <= 7000,
        updated_at: daily?.updated_at ?? null,
      });
    }
    if (request.method === "POST" && url.pathname === "/v1/quota/reserve") {
      const body = await readBody(request), day = now.slice(0, 10);
      if (!body || Object.keys(body).some(k => !["reserve_neurons", "model_id"].includes(k)) ||
          (body.reserve_neurons !== 200 && body.reserve_neurons !== 1200) || body.model_id !== "@cf/zai-org/glm-4.7-flash")
        return json({ error: "Invalid quota reservation request." }, 400);

      // The reservation is a small concurrency hold. Settlement uses the
      // model-specific estimate from provider-reported token counts.
      this.ctx.storage.sql.exec("DELETE FROM quota_reservations WHERE day<>?", day);
      let daily = this.ctx.storage.sql.exec<{day:string;baseline_neurons:number;observed_neurons:number;local_estimated_neurons:number;circuit_open:number}>(
        "SELECT * FROM quota_daily WHERE day=? LIMIT 1", day
      ).toArray()[0];
      if (!daily) {
        this.ctx.storage.sql.exec(
          "INSERT INTO quota_daily (day,baseline_neurons,observed_neurons,observed_at,local_estimated_neurons,circuit_open,updated_at) VALUES (?,0,0,?,0,0,?)",
          day, now, now
        );
        daily = { day, baseline_neurons: 0, observed_neurons: 0, local_estimated_neurons: 0, circuit_open: 0 };
      }
      if (daily.circuit_open === 1) return json({
        error: "Workers AI provider quota circuit is open after a confirmed provider quota failure.",
        reason_code: "quota_circuit_open",
      }, 429);
      const active = this.ctx.storage.sql.exec<{total:number}>(
        "SELECT COALESCE(SUM(reserved_neurons),0) AS total FROM quota_reservations WHERE day=?", day
      ).one().total;
      const projected = Math.max(daily.observed_neurons, daily.baseline_neurons + daily.local_estimated_neurons) + active;
      if (projected + Number(body.reserve_neurons) > 7000) return json({
        error: "Eve's local neuron safety target is reached; the 3,000-neuron reserve is preserved.",
        reason_code: "local_neuron_budget_reached",
        quota: {
          day,
          target_neurons: 7000,
          projected_neurons: projected,
          active_reserved_neurons: active,
          baseline_neurons: daily.baseline_neurons,
          observed_neurons: daily.observed_neurons,
          local_estimated_neurons: daily.local_estimated_neurons,
          requested_reservation_neurons: Number(body.reserve_neurons),
          remaining_to_target: Math.max(0, 7000 - projected),
        },
      }, 429);
      const id = crypto.randomUUID();
      this.ctx.storage.sql.exec(
        "INSERT INTO quota_reservations (id,day,reserved_neurons,created_at) VALUES (?,?,?,?)", id, day, Number(body.reserve_neurons), now
      );
      return json({ reservation_id: id, projected_neurons: projected, reserved_neurons: Number(body.reserve_neurons), target_neurons: 7000 });
    }
    if (request.method === "POST" && url.pathname === "/v1/quota/settle") {
      const body = await readBody(request);
      const allowed = ["reservation_id", "actual_neurons", "input_tokens", "output_tokens", "accounting_source", "settlement_reason"];
      const validToken = (value: unknown) => value === undefined || (Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 1_000_000_000);
      const validReason = (value: unknown) => value === undefined || ["completed", "provider_error", "stream_interrupted", "cancelled", "completed_without_usage", "legacy_or_unknown"].includes(String(value));
      if (!body || Object.keys(body).some(k => !allowed.includes(k)) ||
          typeof body.reservation_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.reservation_id) ||
          (body.actual_neurons !== undefined && (typeof body.actual_neurons !== "number" || !Number.isFinite(body.actual_neurons) || body.actual_neurons < 0 || body.actual_neurons > 100000)) ||
          !validToken(body.input_tokens) || !validToken(body.output_tokens) ||
          (body.accounting_source !== undefined && !["provider_usage", "fallback"].includes(String(body.accounting_source))) ||
          !validReason(body.settlement_reason) ||
          (body.accounting_source === "provider_usage" && (!Number.isSafeInteger(body.input_tokens) || !Number.isSafeInteger(body.output_tokens))))
        return json({ error: "Invalid quota settlement." }, 400);
      const row = this.ctx.storage.sql.exec<{id:string;day:string;reserved_neurons:number}>(
        "SELECT * FROM quota_reservations WHERE id=? LIMIT 1", body.reservation_id
      ).toArray()[0];
      if (!row) return json({ error: "Reservation not found or already settled." }, 404);
      const charged = body.actual_neurons === undefined ? row.reserved_neurons : body.actual_neurons;
      const accountingSource = body.accounting_source === "provider_usage" ? "provider_usage" : "fallback";
      const settlementReason = String(body.settlement_reason ?? (accountingSource === "provider_usage" ? "completed" : "legacy_or_unknown"));
      const inserted = this.ctx.storage.sql.exec<{reservation_id:string}>(
        "INSERT OR IGNORE INTO quota_call_ledger (reservation_id,day,settled_at,model_id,input_tokens,output_tokens,estimated_neurons,accounting_source,settlement_reason) VALUES (?,?,?,?,?,?,?,?,?) RETURNING reservation_id",
        row.id, row.day, now, "@cf/zai-org/glm-4.7-flash",
        accountingSource === "provider_usage" ? Number(body.input_tokens) : null,
        accountingSource === "provider_usage" ? Number(body.output_tokens) : null,
        charged, accountingSource, settlementReason
      ).toArray();
      if (inserted.length !== 1) return json({ error: "Quota call already has an audit record; reservation retained." }, 409);
      const updated = this.ctx.storage.sql.exec<{day:string}>(
        "UPDATE quota_daily SET local_estimated_neurons=local_estimated_neurons+?,updated_at=? WHERE day=? RETURNING day",
        charged, now, row.day
      ).toArray();
      if (updated.length !== 1) {
        this.ctx.storage.sql.exec("DELETE FROM quota_call_ledger WHERE reservation_id=?", row.id);
        return json({ error: "Quota ledger unavailable; reservation retained." }, 503);
      }
      this.ctx.storage.sql.exec("DELETE FROM quota_reservations WHERE id=?", row.id);
      this.ctx.storage.sql.exec("DELETE FROM quota_call_ledger WHERE settled_at < ?", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
      return json({ settled: true, charged_neurons: charged, accounting_source: accountingSource, settlement_reason: settlementReason });
    }
    if (request.method === "POST" && url.pathname === "/v1/quota/circuit") {
      const body = await readBody(request);
      if (!body || Object.keys(body).some(k => !["reservation_id", "reason"].includes(k)) ||
          typeof body.reservation_id !== "string" || body.reason !== "cloudflare_daily_quota_exhausted")
        return json({ error: "Invalid quota circuit request." }, 400);
      const row = this.ctx.storage.sql.exec<{day:string}>(
        "SELECT day FROM quota_reservations WHERE id=? LIMIT 1", body.reservation_id
      ).toArray()[0];
      if (!row) return json({ error: "Reservation not found." }, 404);
      this.ctx.storage.sql.exec("UPDATE quota_daily SET circuit_open=1,updated_at=? WHERE day=?", now, row.day);
      return json({ circuit_open: true, day: row.day });
    }
    if (request.method === "POST" && url.pathname === "/v1/resources") {
      const body = await readBody(request);
      if (!body) return json({ error: "Invalid resource candidate." }, 400);
      let candidate: ReturnType<typeof prepareResourceCandidate>;
      try { candidate = prepareResourceCandidate(body, now); }
      catch (error) { return json({ error: error instanceof Error ? error.message : "Invalid resource candidate." }, 400); }
      const existing = this.ctx.storage.sql.exec<ResourceRow>("SELECT * FROM resources WHERE id=? LIMIT 1", candidate.id).toArray()[0];
      if (existing) return json({ id: existing.id, trust_state: existing.trust_state, created: false }, 200);
      this.ctx.storage.sql.exec(
        "INSERT INTO resources (id,resource_json,trust_state,created_at,updated_at,reviewer,reviewed_at,review_evidence) VALUES (?,?,'quarantined',?,?,NULL,NULL,'[]')",
        candidate.id, JSON.stringify(candidate), now, now
      );
      return json({ id: candidate.id, trust_state: "quarantined", created: true }, 201);
    }

    if (request.method === "POST" && url.pathname === "/v1/artifacts/csv") {
      const body = await readBody(request, MAX_ARTIFACT_REQUEST_BYTES);
      if (!body || Object.keys(body).some(key => !["name", "content", "idempotency_key"].includes(key)) ||
          typeof body.idempotency_key !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.idempotency_key)) {
        return json({ error: "A valid UUID idempotency_key is required." }, 400);
      }
      const validation = validateCsvArtifact({ name: body.name, content: body.content });
      if (!validation.valid) return json({ error: "CSV artifact validation failed.", errors: validation.errors }, 400);
      const artifact = validation.artifact;
      const storedContent = artifact.content;
      const storedBytes = new TextEncoder().encode(storedContent).byteLength;
      const digest = await sha256Hex(storedContent);
      const existing = this.ctx.storage.sql.exec<ArtifactRow>("SELECT * FROM csv_artifacts WHERE idempotency_key=? LIMIT 1", body.idempotency_key).toArray()[0];
      if (existing) {
        if (existing.name !== artifact.name || existing.sha256 !== digest) return json({ error: "Idempotency key was already used for different CSV content.", reason_code: "artifact_idempotency_conflict" }, 409);
        return json({ stored: true, duplicate: true, artifact: { id: existing.id, name: existing.name, filename: existing.filename, media_type: existing.media_type, bytes: existing.bytes, created_at: existing.created_at, sha256: existing.sha256 } });
      }
      const totals = this.ctx.storage.sql.exec<{ count: number; bytes: number }>("SELECT (SELECT COUNT(*) FROM artifacts)+(SELECT COUNT(*) FROM csv_artifacts) AS count,(SELECT COALESCE(SUM(bytes),0) FROM artifacts)+(SELECT COALESCE(SUM(bytes),0) FROM csv_artifacts) AS bytes").one();
      if (totals.count >= MAX_ARTIFACT_COUNT || totals.bytes + storedBytes > MAX_ARTIFACT_TOTAL_BYTES) return json({ error: "Artifact storage limit reached. Ask the owner to remove an existing artifact before saving another.", reason_code: "artifact_storage_limit_reached", max_artifacts: MAX_ARTIFACT_COUNT, max_total_bytes: MAX_ARTIFACT_TOTAL_BYTES }, 429);
      const id = crypto.randomUUID();
      this.ctx.storage.sql.exec("INSERT INTO csv_artifacts (id,name,filename,media_type,content,bytes,created_at,idempotency_key,sha256) VALUES (?,?,?,?,?,?,?,?,?)", id, artifact.name, artifact.filename, artifact.mediaType, storedContent, storedBytes, now, body.idempotency_key, digest);
      return json({ stored: true, duplicate: false, artifact: { id, name: artifact.name, filename: artifact.filename, media_type: artifact.mediaType, bytes: storedBytes, created_at: now, sha256: digest } }, 201);
    }

    if (request.method === "POST" && url.pathname === "/v1/artifacts") {
      const body = await readBody(request, MAX_ARTIFACT_REQUEST_BYTES);
      if (!body || Object.keys(body).some(key => !["name", "content", "idempotency_key"].includes(key)) ||
          typeof body.idempotency_key !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.idempotency_key)) {
        return json({ error: "A valid UUID idempotency_key is required." }, 400);
      }
      const validation = validateHtmlArtifact({ name: body.name, content: body.content });
      if (!validation.valid) return json({ error: "Artifact validation failed.", errors: validation.errors }, 400);
      const artifact = validation.artifact;
      const storedContent = artifact.previewHtml;
      const storedBytes = new TextEncoder().encode(storedContent).byteLength;
      const digest = await sha256Hex(storedContent);
      const existing = this.ctx.storage.sql.exec<ArtifactRow>("SELECT * FROM artifacts WHERE idempotency_key=? LIMIT 1", body.idempotency_key).toArray()[0];
      if (existing) {
        if (existing.name !== artifact.name || existing.sha256 !== digest) {
          return json({ error: "Idempotency key was already used for different artifact content.", reason_code: "artifact_idempotency_conflict" }, 409);
        }
        return json({ stored: true, duplicate: true, artifact: { id: existing.id, name: existing.name, filename: existing.filename, media_type: existing.media_type, bytes: existing.bytes, created_at: existing.created_at, sha256: existing.sha256 } });
      }
      const totals = this.ctx.storage.sql.exec<{ count: number; bytes: number }>("SELECT (SELECT COUNT(*) FROM artifacts)+(SELECT COUNT(*) FROM csv_artifacts) AS count,(SELECT COALESCE(SUM(bytes),0) FROM artifacts)+(SELECT COALESCE(SUM(bytes),0) FROM csv_artifacts) AS bytes").one();
      if (totals.count >= MAX_ARTIFACT_COUNT || totals.bytes + storedBytes > MAX_ARTIFACT_TOTAL_BYTES) {
        return json({ error: "Artifact storage limit reached. Ask the owner to remove an existing artifact before saving another.", reason_code: "artifact_storage_limit_reached", max_artifacts: MAX_ARTIFACT_COUNT, max_total_bytes: MAX_ARTIFACT_TOTAL_BYTES }, 429);
      }
      const id = crypto.randomUUID();
      this.ctx.storage.sql.exec("INSERT INTO artifacts (id,name,filename,media_type,content,bytes,created_at,idempotency_key,sha256) VALUES (?,?,?,?,?,?,?,?,?)", id, artifact.name, artifact.filename, artifact.mediaType, storedContent, storedBytes, now, body.idempotency_key, digest);
      return json({ stored: true, duplicate: false, artifact: { id, name: artifact.name, filename: artifact.filename, media_type: artifact.mediaType, bytes: storedBytes, created_at: now, sha256: digest } }, 201);
    }

    const artifactMatch = url.pathname.match(/^\/v1\/artifacts\/([0-9a-f-]{36})$/i);
    if (request.method === "GET" && artifactMatch) {
      const row = this.ctx.storage.sql.exec<ArtifactRow>("SELECT * FROM artifacts WHERE id=? LIMIT 1", artifactMatch[1]).toArray()[0]
        ?? this.ctx.storage.sql.exec<ArtifactRow>("SELECT * FROM csv_artifacts WHERE id=? LIMIT 1", artifactMatch[1]).toArray()[0];
      if (!row) return json({ error: "Artifact not found." }, 404);
      const digest = await sha256Hex(row.content);
      if (row.sha256 && row.sha256 !== digest) return json({ error: "Stored artifact integrity check failed.", reason_code: "artifact_integrity_mismatch" }, 500);
      if (!row.sha256) this.ctx.storage.sql.exec("UPDATE artifacts SET sha256=? WHERE id=?", digest, row.id);
      return json({ artifact: { ...row, sha256: digest } });
    }

    if (request.method === "GET" && url.pathname === "/v1/owner/artifacts") {
      const limit = boundedLimit(url.searchParams.get("limit"), 20);
      const artifacts = this.ctx.storage.sql.exec<Omit<ArtifactRow, "content">>(
        "SELECT id,name,filename,media_type,bytes,created_at,sha256 FROM (SELECT id,name,filename,media_type,bytes,created_at,sha256 FROM artifacts UNION ALL SELECT id,name,filename,media_type,bytes,created_at,sha256 FROM csv_artifacts) ORDER BY created_at DESC LIMIT ?", limit
      ).toArray();
      return json({ artifacts });
    }

    const ownerArtifactMatch = url.pathname.match(/^\/v1\/owner\/artifacts\/([0-9a-f-]{36})$/i);
    if (request.method === "GET" && ownerArtifactMatch) {
      const artifact = this.ctx.storage.sql.exec<ArtifactRow>("SELECT * FROM artifacts WHERE id=? LIMIT 1", ownerArtifactMatch[1]).toArray()[0]
        ?? this.ctx.storage.sql.exec<ArtifactRow>("SELECT * FROM csv_artifacts WHERE id=? LIMIT 1", ownerArtifactMatch[1]).toArray()[0];
      if (!artifact) return json({ error: "Artifact not found." }, 404);
      const digest = await sha256Hex(artifact.content);
      if (artifact.sha256 && artifact.sha256 !== digest) return json({ error: "Stored artifact integrity check failed.", reason_code: "artifact_integrity_mismatch" }, 500);
      if (!artifact.sha256) this.ctx.storage.sql.exec("UPDATE artifacts SET sha256=? WHERE id=?", digest, artifact.id);
      return json({ artifact: { ...artifact, sha256: digest } });
    }

    const ownerArtifactDeleteMatch = url.pathname.match(/^\/v1\/owner\/artifacts\/([0-9a-f-]{36})\/delete$/i);
    if (request.method === "POST" && ownerArtifactDeleteMatch) {
      const deleted = this.ctx.storage.sql.exec<{ id: string }>(
        "DELETE FROM artifacts WHERE id=? RETURNING id", ownerArtifactDeleteMatch[1]
      ).toArray();
      const csvDeleted = deleted.length ? [] : this.ctx.storage.sql.exec<{ id: string }>(
        "DELETE FROM csv_artifacts WHERE id=? RETURNING id", ownerArtifactDeleteMatch[1]
      ).toArray();
      return deleted.length + csvDeleted.length === 1 ? json({ id: ownerArtifactDeleteMatch[1], deleted: true }) : json({ error: "Artifact not found." }, 404);
    }

    if (request.method === "POST" && ["/v1/tasks", "/v1/owner/tasks"].includes(url.pathname)) {
      const body = await readBody(request);
      const allowed = new Set(["idempotency_key", "task_type", "title", "goal", "approved_scope"]);
      if (!body || Object.keys(body).some(key => !allowed.has(key)) ||
          !isSafeMemoryText(body.idempotency_key, 200) || !isSafeMemoryText(body.task_type, 80) ||
          !isSafeMemoryText(body.title, 200) || !isSafeMemoryText(body.goal, 1000) ||
          !isSafeMemoryText(body.approved_scope, 2000)) return json({ error: "Invalid task proposal." }, 400);
      const key = String(body.idempotency_key).trim();
      const existing = this.ctx.storage.sql.exec<TaskRow>("SELECT * FROM tasks WHERE idempotency_key = ? LIMIT 1", key).toArray()[0];
      if (existing) return json({ task: taskFromRow(existing), created: false });
      const taskInput = { idempotency_key: key, task_type: String(body.task_type).trim(), title: String(body.title).trim(), goal: String(body.goal).trim(), approved_scope: String(body.approved_scope).trim(), scope_id: "owner_review_required" };
      const missionAuthorized = false;
      const task = createTaskRecord({ id: crypto.randomUUID(), ...taskInput }, { now, missionAuthorized: false });
      this.ctx.storage.sql.exec("INSERT INTO tasks (id,idempotency_key,task_type,title,goal,approved_scope,scope_id,status,owner_approved,mission_authorized,created_at,updated_at,attempt_count,max_attempts,step_count,max_steps,next_run_at,checkpoint_summary,result_summary,evidence_refs,started_at,finished_at) VALUES (?,?,?,?,?,?,?,?,0,?,?,?,0,?,0,?,NULL,NULL,NULL,'[]',NULL,NULL)", task.id, task.idempotency_key, task.task_type, task.title, task.goal, task.approved_scope, task.scope_id, task.status, missionAuthorized ? 1 : 0, task.created_at, task.updated_at, task.max_attempts, task.max_steps);
      return json({ task, created: true, mission_authorized: missionAuthorized }, 201);
    }

    if (request.method === "GET" && url.pathname === "/v1/tasks") {
      const limit = boundedLimit(url.searchParams.get("limit"), 20);
      const rows = this.ctx.storage.sql.exec<TaskRow>("SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?", limit).toArray();
      return json({ tasks: rows.map(taskFromRow) });
    }

    if (request.method === "GET" && url.pathname === "/v1/owner/status") {
      const control = this.ctx.storage.sql.exec<{ queue_paused: number; reason: string | null; updated_at: string }>("SELECT queue_paused,reason,updated_at FROM task_control WHERE id=1").one();
      const running = this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM tasks WHERE status='running'").one().count;
      const queued = this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM tasks WHERE status='queued' AND owner_approved=1 AND mission_authorized=0").one().count;
      return json({ queue_paused: control.queue_paused === 1, reason: control.reason, updated_at: control.updated_at, running_tasks: running, queued_tasks: queued });
    }

    if (request.method === "POST" && url.pathname === "/v1/owner/control") {
      const body = await readBody(request);
      if (!body || Object.keys(body).some(key => !["action","reason"].includes(key)) || !["pause","resume"].includes(body.action)) return json({ error: "Invalid owner control action." }, 400);
      if (body.reason !== undefined && body.reason !== null && !isSafeMemoryText(body.reason, 500)) return json({ error: "Invalid pause reason." }, 400);
      const paused = body.action === "pause";
      const updated = this.ctx.storage.sql.exec<{ id: number }>(
        "UPDATE task_control SET queue_paused=?,reason=?,updated_at=? WHERE id=1 RETURNING id",
        paused ? 1 : 0, paused ? (body.reason ?? "Paused by owner") : null, now
      ).toArray();
      if (updated.length !== 1) return json({ error: "Owner control state unavailable." }, 503);
      await this.scheduleTaskWakeup();
      return json({ queue_paused: paused, reason: paused ? (body.reason ?? "Paused by owner") : null });
    }

    if (request.method === "GET" && url.pathname === "/v1/owner/tasks") {
      const limit = boundedLimit(url.searchParams.get("limit"), 20);
      const rows = this.ctx.storage.sql.exec<TaskRow>("SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?", limit).toArray();
      return json({ tasks: rows.map(taskFromRow) });
    }

    if (request.method === "GET" && url.pathname === "/v1/owner/resources") {
      const limit = boundedLimit(url.searchParams.get("limit"), 30);
      const rows = this.ctx.storage.sql.exec<ResourceRow>("SELECT * FROM resources ORDER BY created_at DESC LIMIT ?", limit).toArray();
      return json({ resources: rows.map(row => {
        let resource: unknown = null;
        try { resource = JSON.parse(row.resource_json); } catch { /* Keep corrupt metadata visible without trusting it. */ }
        let reviewEvidence: string[] = [];
        try { const parsed: unknown = JSON.parse(row.review_evidence); if (Array.isArray(parsed) && parsed.every(item => typeof item === "string")) reviewEvidence = parsed; } catch { /* Fail closed. */ }
        return { id: row.id, resource, trust_state: row.trust_state, created_at: row.created_at, updated_at: row.updated_at, reviewer: row.reviewer, reviewed_at: row.reviewed_at, review_evidence: reviewEvidence };
      }) });
    }

    const resourceDecision = url.pathname.match(/^\/v1\/owner\/resources\/([a-z0-9][a-z0-9._:-]{0,159})\/decision$/);
    if (request.method === "POST" && resourceDecision) {
      const body = await readBody(request);
      if (!body || Object.keys(body).some(key => !["decision", "review_evidence"].includes(key)) ||
          !["reviewed", "approve", "reject", "stale"].includes(String(body.decision)) ||
          !Array.isArray(body.review_evidence) || body.review_evidence.length < 1 || body.review_evidence.length > 10 ||
          body.review_evidence.some(item => !isSafeMemoryText(item, 1000))) {
        return json({ error: "A valid decision and 1–10 evidence notes are required." }, 400);
      }
      const row = this.ctx.storage.sql.exec<ResourceRow>("SELECT * FROM resources WHERE id=? LIMIT 1", resourceDecision[1]).toArray()[0];
      if (!row) return json({ error: "Resource not found." }, 404);
      if (row.trust_state !== "quarantined" && row.trust_state !== "reviewed") return json({ error: "This resource is already decided; submit a new revision for re-review." }, 409);
      const status = body.decision === "approve" ? "approved" : body.decision === "reject" ? "rejected" : body.decision === "stale" ? "stale" : "reviewed";
      let resource: Record<string, unknown>;
      try { resource = JSON.parse(row.resource_json) as Record<string, unknown>; }
      catch { return json({ error: "Stored resource metadata is corrupt." }, 500); }
      resource.trust_state = status;
      const evidence = (body.review_evidence as string[]).map(item => item.trim());
      resource.reviewer = "owner";
      resource.reviewed_at = now;
      resource.review_evidence = evidence;
      const updated = this.ctx.storage.sql.exec<{ id: string }>(
        "UPDATE resources SET resource_json=?,trust_state=?,updated_at=?,reviewer='owner',reviewed_at=?,review_evidence=? WHERE id=? AND trust_state=? RETURNING id",
        JSON.stringify(resource), status, now, now, JSON.stringify(evidence), row.id, row.trust_state
      ).toArray();
      if (updated.length !== 1) return json({ error: "Resource review state conflict." }, 409);
      return json({ id: row.id, trust_state: status, reviewer: "owner", reviewed_at: now, review_evidence: evidence });
    }

    if (request.method === "GET" && url.pathname === "/v1/owner/proposals") {
      const limit = boundedLimit(url.searchParams.get("limit"), 20);
      const proposals = this.ctx.storage.sql.exec<MemoryRow>(
        "SELECT * FROM memories WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?",
        limit
      ).toArray();
      return json({ proposals });
    }



    const taskMatch = url.pathname.match(/^\/v1\/tasks\/([0-9a-f-]{36})$/i);
    if (request.method === "GET" && taskMatch) {
      const row = this.ctx.storage.sql.exec<TaskRow>("SELECT * FROM tasks WHERE id = ? LIMIT 1", taskMatch[1]).toArray()[0];
      return row ? json({ task: taskFromRow(row) }) : json({ error: "Task not found." }, 404);
    }

    const approveMatch = url.pathname.match(/^\/v1\/tasks\/([0-9a-f-]{36})\/approve$/i);
    if (request.method === "POST" && approveMatch) {
      const body = await readBody(request);
      const allowedScopes = new Set(["owner_review_required", "product_development", "testing", "documentation", "market_research"]);
      if (body && (Object.keys(body).some(key => key !== "scope_id") ||
          (body.scope_id !== undefined && (typeof body.scope_id !== "string" || !allowedScopes.has(body.scope_id))))) {
        return json({ error: "Only an allowlisted owner-selected scope may be assigned during approval." }, 400);
      }
      const scopeId = typeof body?.scope_id === "string" ? body.scope_id : "owner_review_required";
      const row = this.ctx.storage.sql.exec<TaskRow>("SELECT * FROM tasks WHERE id = ? LIMIT 1", approveMatch[1]).toArray()[0];
      if (!row) return json({ error: "Task not found." }, 404);
      const current = taskFromRow(row);
      if (current.status !== "proposed") return json({ error: "Only proposed tasks can be approved." }, 409);
      const approved = transitionTask(current, "queued", { ownerApproved: true, now });
      const updated = this.ctx.storage.sql.exec<{ id: string }>("UPDATE tasks SET status='queued', owner_approved=1, scope_id=?, updated_at=? WHERE id=? AND status='proposed' AND owner_approved=0 RETURNING id", scopeId, now, current.id).toArray();
      if (updated.length !== 1) return json({ error: "Task approval state conflict." }, 409);
      return json({ task: { ...approved, scope_id: scopeId } });
    }

    if (request.method === "POST" && url.pathname === "/v1/tasks/claim-next") {
      // Do not consume a task attempt when the next model call is already blocked.
      // This is a best-effort preflight; quota can still change after this check.
      const quotaDay = now.slice(0, 10);
      const quotaDaily = this.ctx.storage.sql.exec<{
        day: string; baseline_neurons: number; observed_neurons: number;
        local_estimated_neurons: number; circuit_open: number;
      }>("SELECT * FROM quota_daily WHERE day=? LIMIT 1", quotaDay).toArray()[0];
      const quotaActive = this.ctx.storage.sql.exec<{ total: number }>(
        "SELECT COALESCE(SUM(reserved_neurons),0) AS total FROM quota_reservations WHERE day=?", quotaDay
      ).one().total;
      const quotaProjected = quotaDaily
        ? Math.max(quotaDaily.observed_neurons, quotaDaily.baseline_neurons + quotaDaily.local_estimated_neurons) + quotaActive
        : quotaActive;
      if (quotaDaily?.circuit_open === 1) {
        return json({ task: null, quota_blocked: true, reason_code: "quota_circuit_open" });
      }
      if (quotaProjected + 200 > 7000) {
        return json({ task: null, quota_blocked: true, reason_code: "local_neuron_budget_reached" });
      }
      const control = this.ctx.storage.sql.exec<{ queue_paused: number; reason: string | null }>("SELECT queue_paused,reason FROM task_control WHERE id=1").one();
      if (control.queue_paused === 1) return json({ task: null, paused: true, reason: control.reason });
      const runningRow = this.ctx.storage.sql.exec<TaskRow>("SELECT * FROM tasks WHERE status='running' ORDER BY updated_at ASC LIMIT 1").toArray()[0];
      if (runningRow) {
        const runningTask = taskFromRow(runningRow);
        if (!isTaskLeaseExpired(runningTask, { now: Date.parse(now) })) return json({ task: null });
        const retryable = runningTask.attempt_count + 1 < runningTask.max_attempts;
        const recovered = transitionTask(runningTask, retryable ? "waiting" : "failed", {
          now,
          countAttempt: true,
          checkpointSummary: (runningTask.checkpoint_summary ? runningTask.checkpoint_summary + "\n" : "") +
            "Recovered after a stale scheduled run; inspect prior evidence before continuing.",
          resultSummary: retryable ? runningTask.result_summary : "Execution lease expired on the final allowed attempt; no further retry.",
          nextRunAt: retryable ? now : undefined,
        });
        const recoveredRow = this.ctx.storage.sql.exec<{ id: string }>(
          "UPDATE tasks SET status=?,attempt_count=?,step_count=?,updated_at=?,next_run_at=?,checkpoint_summary=?,result_summary=?,finished_at=? WHERE id=? AND status='running' AND updated_at=? RETURNING id",
          recovered.status, recovered.attempt_count, recovered.step_count, now, recovered.next_run_at, recovered.checkpoint_summary, recovered.result_summary,
          recovered.finished_at ?? null, runningTask.id, runningTask.updated_at
        ).toArray();
        if (recoveredRow.length !== 1) return json({ task: null });
      }
      const stillRunning = this.ctx.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM tasks WHERE status='running'").one().count;
      if (stillRunning > 0) return json({ task: null });
      const rows = this.ctx.storage.sql.exec<TaskRow>(
        "SELECT * FROM tasks WHERE owner_approved=1 AND mission_authorized=0 AND attempt_count<max_attempts AND step_count<max_steps AND ((status='queued' AND (next_run_at IS NULL OR next_run_at<=?)) OR (status='waiting' AND next_run_at IS NOT NULL AND next_run_at<=?)) ORDER BY COALESCE(next_run_at,created_at) ASC LIMIT 500",
        now, now
      ).toArray();
      const selected = selectNextTask(rows.map(taskFromRow), { now: Date.parse(now) });
      if (!selected) return json({ task: null });
      const claimed = transitionTask(selected, "running", { now });
      const updated = this.ctx.storage.sql.exec<{ id: string }>("UPDATE tasks SET status='running', step_count=?, updated_at=?, started_at=COALESCE(started_at,?), next_run_at=NULL WHERE id=? AND status=? AND owner_approved=1 AND mission_authorized=0 AND attempt_count<max_attempts AND step_count<max_steps RETURNING id", claimed.step_count, now, now, selected.id, selected.status).toArray();
      if (updated.length !== 1) return json({ error: "Task claim state conflict." }, 409);
      await this.scheduleTaskWakeup();
      return json({ task: claimed });
    }

    const heartbeatMatch = url.pathname.match(/^\/v1\/tasks\/([0-9a-f-]{36})\/heartbeat$/i);
    if (request.method === "POST" && heartbeatMatch) {
      const body = await readBody(request);
      if (body && Object.keys(body).length > 0) return json({ error: "Heartbeat body must be empty." }, 400);
      const updated = this.ctx.storage.sql.exec<{ id: string }>(
        "UPDATE tasks SET updated_at=? WHERE id=? AND status='running' AND owner_approved=1 AND mission_authorized=0 RETURNING id",
        now, heartbeatMatch[1]
      ).toArray();
      if (updated.length !== 1) return json({ error: "Only an actively running owner-approved task can heartbeat." }, 409);
      return json({ heartbeat: true, updated_at: now });
    }

    const ownerControlMatch = url.pathname.match(/^\/v1\/tasks\/([0-9a-f-]{36})\/owner-control$/i);
    if (request.method === "POST" && ownerControlMatch) {
      const body = await readBody(request);
      if (!body || Object.keys(body).some(key => key !== "action") || !["pause", "resume", "cancel"].includes(String(body.action))) {
        return json({ error: "Invalid owner task control." }, 400);
      }
      const row = this.ctx.storage.sql.exec<TaskRow>("SELECT * FROM tasks WHERE id=? LIMIT 1", ownerControlMatch[1]).toArray()[0];
      if (!row) return json({ error: "Task not found." }, 404);
      const current = taskFromRow(row);
      if (body.action === "cancel" && current.status !== "paused") {
        return json({ error: "Pause the task before cancelling it." }, 409);
      }
      const nextStatus = body.action === "pause" ? "paused" : body.action === "cancel" ? "cancelled" : "queued";
      let next;
      try { next = transitionTask(current, nextStatus, { now, ownerApproved: body.action === "resume" }); }
      catch { return json({ error: "Invalid task state transition." }, 409); }
      const updated = this.ctx.storage.sql.exec<{ id: string }>("UPDATE tasks SET status=?, owner_approved=?, updated_at=?, next_run_at=NULL, finished_at=? WHERE id=? AND status=? RETURNING id", next.status, next.owner_approved ? 1 : 0, now, next.finished_at ?? null, current.id, current.status).toArray();
      if (updated.length !== 1) return json({ error: "Task state conflict." }, 409);
      await this.scheduleTaskWakeup();
      return json({ task: next });
    }

    const transitionMatch = url.pathname.match(/^\/v1\/tasks\/([0-9a-f-]{36})\/transition$/i);
    if (request.method === "POST" && transitionMatch) {
      const body = await readBody(request);
      if (!body || Object.keys(body).some(key => !["status","checkpoint_summary","result_summary","evidence_refs","next_run_at"].includes(key)) || !TASK_STATUS_VALUES.includes(String(body.status))) return json({ error: "Invalid task transition." }, 400);
      if (body.checkpoint_summary !== undefined && body.checkpoint_summary !== null && !isSafeMemoryText(body.checkpoint_summary, 2000)) return json({ error: "Invalid checkpoint summary." }, 400);
      if (body.result_summary !== undefined && body.result_summary !== null && !isSafeMemoryText(body.result_summary, 4000)) return json({ error: "Invalid result summary." }, 400);
      if (body.evidence_refs !== undefined && (!Array.isArray(body.evidence_refs) || body.evidence_refs.length > 20 || !body.evidence_refs.every(item => typeof item === "string" && isSafeMemoryText(item, 500)))) return json({ error: "Invalid evidence references." }, 400);
      if (body.next_run_at !== undefined && body.next_run_at !== null && (typeof body.next_run_at !== "string" || !Number.isFinite(Date.parse(body.next_run_at)))) return json({ error: "Invalid next_run_at timestamp." }, 400);
      const row = this.ctx.storage.sql.exec<TaskRow>("SELECT * FROM tasks WHERE id=? LIMIT 1", transitionMatch[1]).toArray()[0];
      if (!row) return json({ error: "Task not found." }, 404);
      const current = taskFromRow(row);
      const control = this.ctx.storage.sql.exec<{ queue_paused: number }>("SELECT queue_paused FROM task_control WHERE id=1").one();
      if (control.queue_paused === 1 && body.status === "waiting" && body.next_run_at) return json({ error: "The owner has paused the queue; scheduled continuation is blocked.", reason_code: "queue_paused" }, 409);
      if (current.status === "paused" && body.status === "queued") return json({ error: "Owner approval is required to resume a paused task." }, 409);
      const stepBudgetExhausted = body.status === "waiting" && current.step_count >= current.max_steps;
      const nextStatus = stepBudgetExhausted ? "paused" : String(body.status);
      const checkpointSummary = stepBudgetExhausted
        ? [body.checkpoint_summary, "Maximum progress-step budget reached; owner review required."].filter(Boolean).join("\\n").slice(0, 2000)
        : body.checkpoint_summary;
      let next;
      try { next = transitionTask(current, nextStatus, { now, checkpointSummary, resultSummary: body.result_summary, evidenceRefs: body.evidence_refs, nextRunAt: stepBudgetExhausted ? undefined : body.next_run_at }); }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const reasonCode = message.includes("owner_approval_required") ? "owner_approval_required"
          : message.includes("task_completion_evidence_required") ? "completion_evidence_required"
          : message.includes("task_state_conflict") ? "task_state_conflict"
          : message.includes("invalid_task_transition") ? "invalid_task_transition"
          : message.includes("task_attempt_budget_exhausted") ? "attempt_budget_exhausted"
          : message.includes("task_step_budget_exhausted") ? "step_budget_exhausted"
          : "transition_validation_failed";
        const safeMessage = reasonCode === "owner_approval_required" ? "Owner approval is required."
          : reasonCode === "completion_evidence_required" ? "A completed task requires a result summary and evidence references."
          : reasonCode === "task_state_conflict" ? "The task state changed before the transition could be saved."
          : reasonCode === "invalid_task_transition" ? "The requested task status transition is not allowed."
          : reasonCode === "attempt_budget_exhausted" ? "The task retry budget is exhausted."
          : reasonCode === "step_budget_exhausted" ? "The task progress-step budget is exhausted."
          : "The task transition failed validation.";
        return json({ error: safeMessage, reason_code: reasonCode }, 409);
      }
      const update = this.ctx.storage.sql.exec<{ id: string }>("UPDATE tasks SET status=?,owner_approved=?,updated_at=?,attempt_count=?,next_run_at=?,checkpoint_summary=?,result_summary=?,evidence_refs=?,started_at=?,finished_at=? WHERE id=? AND status=? RETURNING id", next.status, next.owner_approved ? 1 : 0, next.updated_at, next.attempt_count, next.next_run_at, next.checkpoint_summary, next.result_summary, JSON.stringify(next.evidence_refs), next.started_at ?? null, next.finished_at ?? null, current.id, current.status).toArray();
      if (update.length !== 1) return json({ error: "The task state changed before the transition could be saved.", reason_code: "task_state_conflict" }, 409);
      await this.scheduleTaskWakeup();
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
      const result = this.ctx.storage.sql.exec<{ id: string }>(
        "UPDATE memories SET status = ?, updated_at = ? WHERE id = ? AND status = 'pending' RETURNING id",
        status, now, match[1]
      ).toArray();
      if (result.length !== 1) return json({ error: "Pending proposal not found." }, 404);
      return json({ id: match[1], status });
    }

    return json({ error: "Not found." }, 404);
  }
}

const ownerVerificationCache = new Map<string, number>();
const ownerFailureWindows = new Map<string, { startedAt: number; failures: number }>();
const ownerDiagnosticWindows = new Map<string, number>();
const OWNER_CACHE_MS = 60_000;
const OWNER_FAILURE_LIMIT = 10;
const OWNER_FAILURE_WINDOW_MS = 60_000;
const OWNER_DIAGNOSTIC_COOLDOWN_MS = 5_000;

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function ownerAuthRateLimited(request: Request): boolean {
  const key = request.headers.get("cf-connecting-ip") ?? "unknown";
  const now = Date.now();
  const window = ownerFailureWindows.get(key);
  if (!window || now - window.startedAt >= OWNER_FAILURE_WINDOW_MS) {
    ownerFailureWindows.set(key, { startedAt: now, failures: 0 });
    return false;
  }
  return window.failures >= OWNER_FAILURE_LIMIT;
}

function recordOwnerAuthFailure(request: Request): void {
  const key = request.headers.get("cf-connecting-ip") ?? "unknown";
  const now = Date.now();
  const window = ownerFailureWindows.get(key);
  if (!window || now - window.startedAt >= OWNER_FAILURE_WINDOW_MS) {
    ownerFailureWindows.set(key, { startedAt: now, failures: 1 });
  } else {
    window.failures += 1;
  }
}

function ownerDiagnosticRateLimited(request: Request): boolean {
  const key = request.headers.get("cf-connecting-ip") ?? "server";
  const now = Date.now();
  const lastRunAt = ownerDiagnosticWindows.get(key);
  if (lastRunAt !== undefined && now - lastRunAt < OWNER_DIAGNOSTIC_COOLDOWN_MS) return true;
  ownerDiagnosticWindows.set(key, now);
  return false;
}

async function ownerAuthDiagnostic(request: Request, env: Env): Promise<Response> {
  if (request.headers.has("origin")) return json({ reason_code: "diagnostic_access_denied" }, 403);
  const sharedSecretReason = diagnosticSharedSecretReason(env.MEMORY_API_TOKEN);
  if (sharedSecretReason) return json({ reason_code: sharedSecretReason }, 503);
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!constantTimeEqual(supplied, env.MEMORY_API_TOKEN)) {
    return json({ reason_code: "diagnostic_access_denied" }, 401);
  }

  const body = await readBody(request);
  const allowed = new Set(["access_token", "expected_client_id"]);
  if (!body || Object.keys(body).some(key => !allowed.has(key)) ||
      (body.access_token !== undefined && typeof body.access_token !== "string") ||
      (body.expected_client_id !== undefined && typeof body.expected_client_id !== "string")) {
    return json({ reason_code: "diagnostic_request_invalid" }, 400);
  }
  const expectedClientId = typeof body.expected_client_id === "string" ? body.expected_client_id : "";
  const clientIdComparison = compareOwnerClientId(expectedClientId, env.GITHUB_CLIENT_ID);
  if (clientIdComparison !== "match") {
    return json({ reason_code: clientIdComparison, client_id_match: false });
  }

  const configurationReason = ownerAuthConfigurationReason(env);
  if (configurationReason) {
    return json({ reason_code: configurationReason, client_id_match: true });
  }

  const accessToken = typeof body.access_token === "string" ? body.access_token : "";
  if (!accessToken || accessToken.length > 4096) {
    return json({ reason_code: "owner_session_token_missing_or_invalid", client_id_match: true });
  }
  if (ownerDiagnosticRateLimited(request)) {
    return json({ reason_code: "diagnostic_rate_limited" }, 429);
  }

  const reasonCode = await verifyOwnerGithubToken(accessToken, env);
  return json({ reason_code: reasonCode, client_id_match: true });
}

async function isAuthorizedGithubOwner(
  accessToken: string,
  env: Env,
  request: Request,
): Promise<OwnerAuthReasonCode> {
  if (!accessToken || accessToken.length > 4096) return "owner_session_token_missing_or_invalid";
  const configurationReason = ownerAuthConfigurationReason(env);
  if (configurationReason) return configurationReason;
  if (ownerAuthRateLimited(request)) return "owner_auth_rate_limited";

  const tokenHash = await sha256Hex(accessToken);
  const cachedUntil = ownerVerificationCache.get(tokenHash);
  if (cachedUntil && cachedUntil > Date.now()) return "owner_auth_ok";

  const reasonCode = await verifyOwnerGithubToken(accessToken, env);
  if (reasonCode !== "owner_auth_ok") {
    recordOwnerAuthFailure(request);
    return reasonCode;
  }
  ownerVerificationCache.set(tokenHash, Date.now() + OWNER_CACHE_MS);
  return "owner_auth_ok";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const authorization = request.headers.get("authorization") ?? "";
    const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    const url = new URL(request.url);
    const ownerApprovalRoute = request.method === "POST" && /^\/v1\/tasks\/[0-9a-f-]{36}\/approve$/i.test(url.pathname);
    const ownerDiagnosticRoute = request.method === "POST" && url.pathname === "/v1/internal/owner-auth-diagnostic";
    const ownerControlRoute = request.method === "POST" && /^\/v1\/tasks\/[0-9a-f-]{36}\/owner-control$/i.test(url.pathname);
    const ownerMemoryDecisionRoute = request.method === "POST" && /^\/v1\/proposals\/[0-9a-f-]{36}\/decision$/i.test(url.pathname);
    const ownerResourceDecisionRoute = request.method === "POST" && /^\/v1\/owner\/resources\/[a-z0-9][a-z0-9._:-]{0,159}\/decision$/.test(url.pathname);
    const ownerArtifactDeleteRoute = request.method === "POST" && /^\/v1\/owner\/artifacts\/[0-9a-f-]{36}\/delete$/i.test(url.pathname);
    const ownerArtifactReadRoute = request.method === "GET" && (/^\/v1\/owner\/artifacts$/i.test(url.pathname) || /^\/v1\/owner\/artifacts\/[0-9a-f-]{36}$/i.test(url.pathname));
    const ownerReadRoute = request.method === "GET" && (["/v1/owner/tasks", "/v1/owner/proposals", "/v1/owner/status", "/v1/owner/resources", "/v1/owner/quota/status", "/v1/owner/quota/calls", "/v1/owner/research/credits/status"].includes(url.pathname) || ownerArtifactReadRoute);
    const ownerQueueControlRoute = request.method === "POST" && url.pathname === "/v1/owner/control";
    const ownerTaskCreateRoute = request.method === "POST" && url.pathname === "/v1/owner/tasks";
    const ownerOnlyRoute = ownerApprovalRoute || ownerControlRoute || ownerMemoryDecisionRoute || ownerResourceDecisionRoute || ownerArtifactDeleteRoute || ownerReadRoute || ownerQueueControlRoute || ownerTaskCreateRoute;
    const ownerOrigin = "https://autonomous-dev-ai.vercel.app";
    const origin = request.headers.get("origin");
    const withOwnerCors = (response: Response) => {
      if (origin !== ownerOrigin) return response;
      const headers = new Headers(response.headers);
      headers.set("access-control-allow-origin", ownerOrigin);
      headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
      headers.set("access-control-allow-headers", "Authorization, Content-Type");
      headers.set("access-control-max-age", "86400");
      headers.append("vary", "Origin");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    };
    if (origin && origin !== ownerOrigin) return json({ error: "Origin not allowed." }, 403);
    if (request.method === "OPTIONS") {
      if (url.pathname === "/v1/internal/owner-auth-diagnostic") {
        return json({ reason_code: "diagnostic_access_denied" }, 403);
      }
      if (origin !== ownerOrigin) return json({ error: "Origin not allowed." }, 403);
      return withOwnerCors(new Response(null, { status: 204 }));
    }
    if (ownerDiagnosticRoute) {
      return await ownerAuthDiagnostic(request, env);
    }
    if (ownerOnlyRoute) {
      const reasonCode = await isAuthorizedGithubOwner(supplied, env, request);
      if (reasonCode !== "owner_auth_ok") {
        const rateLimited = reasonCode === "owner_auth_rate_limited";
        return withOwnerCors(json({ error: rateLimited ? "Rate limited." : "Unauthorized.", reason_code: reasonCode }, rateLimited ? 429 : 401));
      }
    } else if (!env.MEMORY_API_TOKEN || !constantTimeEqual(supplied, env.MEMORY_API_TOKEN)) {
      return withOwnerCors(json({ error: "Unauthorized." }, 401));
    }
    if (!url.pathname.startsWith("/v1/")) return withOwnerCors(json({ error: "Not found." }, 404));
    const id = env.MEMORY.idFromName("single-owner-memory");
    try {
      return withOwnerCors(await env.MEMORY.get(id).fetch(request));
    } catch (error) {
      const incidentId = crypto.randomUUID();
      const exceptionName = error instanceof Error && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(error.name) ? error.name : "UnknownError";
      console.error(JSON.stringify({ incident_id: incidentId, route: url.pathname, method: request.method, exception_name: exceptionName }));
      return withOwnerCors(json({ error: "Internal server error.", incident_id: incidentId }, 500));
    }
  },
};