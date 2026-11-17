const TASK_STATUSES = Object.freeze([
  "proposed", "queued", "running", "waiting", "paused",
  "succeeded", "failed", "cancelled"
]);

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

// These scope IDs are owner-defined policy, not model-authored free text.
// Their meanings are deliberately narrow and exclude all external side effects.
export const OWNER_DEFINED_SCOPE_IDS = Object.freeze({
  market_research: "public_web_research_no_contact",
  product_development: "local_prototype_no_external_effects",
  testing: "automated_tests_no_external_effects",
  documentation: "documentation_only",
});
const OWNER_REVIEW_SCOPE_ID = "owner_review_required";
// Standing mission authorization is disabled until a trusted owner-controlled
// delegation mechanism exists. Agent-supplied task metadata is never authority.
export function isMissionAuthorizedTask(_input) { return false; }
const TRANSITIONS = Object.freeze({
  proposed: new Set(["queued", "cancelled"]),
  queued: new Set(["running", "paused", "failed", "cancelled"]),
  running: new Set(["waiting", "paused", "succeeded", "failed", "cancelled"]),
  waiting: new Set(["queued", "running", "paused", "failed", "cancelled"]),
  paused: new Set(["queued", "failed", "cancelled"]),
  succeeded: new Set(),
  failed: new Set(),
  cancelled: new Set()
});

const REQUIRED = [
  "id", "idempotency_key", "task_type", "title", "goal",
  "approved_scope", "scope_id", "created_at", "updated_at", "status"
];

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validTimestamp(value) {
  return nonEmpty(value) && Number.isFinite(Date.parse(value));
}

export function validateTaskRecord(task) {
  if (!task || typeof task !== "object" || Array.isArray(task)) {
    return { valid: false, reason: "invalid_record" };
  }
  for (const field of REQUIRED) {
    if (!nonEmpty(task[field])) return { valid: false, reason: `missing_${field}` };
  }
  if (!TASK_STATUSES.includes(task.status)) return { valid: false, reason: "invalid_status" };
  if (!validTimestamp(task.created_at) || !validTimestamp(task.updated_at)) {
    return { valid: false, reason: "invalid_timestamp" };
  }
  if (typeof task.owner_approved !== "boolean") return { valid: false, reason: "missing_owner_approval_state" };
  if (!Number.isInteger(task.attempt_count) || task.attempt_count < 0) {
    return { valid: false, reason: "invalid_attempt_count" };
  }
  if (!Number.isInteger(task.max_attempts) || task.max_attempts < 1 || task.max_attempts > 3) {
    return { valid: false, reason: "invalid_max_attempts" };
  }
  if (task.attempt_count > task.max_attempts) return { valid: false, reason: "attempt_budget_exceeded" };
  if (typeof task.mission_authorized !== "boolean") return { valid: false, reason: "missing_mission_authorization_state" };
  if (task.mission_authorized === true && !isMissionAuthorizedTask(task)) return { valid: false, reason: "invalid_mission_authorized_scope" };
  if (task.status !== "proposed" && task.owner_approved !== true && task.mission_authorized !== true) {
    return { valid: false, reason: "unapproved_task_cannot_be_active" };
  }
  if (task.next_run_at != null && !validTimestamp(task.next_run_at)) {
    return { valid: false, reason: "invalid_next_run_at" };
  }
  return { valid: true };
}

/** Create a metadata-only task record. Persistence and ID generation belong to the caller. */
export function createTaskRecord(input, { now = new Date().toISOString(), maxAttempts = 3, missionAuthorized = false } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("Task input must be an object");
  }
  const record = {
    id: input.id,
    idempotency_key: input.idempotency_key,
    task_type: input.task_type,
    title: input.title,
    goal: input.goal,
    approved_scope: input.approved_scope,
    scope_id: input.scope_id ?? OWNER_REVIEW_SCOPE_ID,
    status: missionAuthorized === true ? "queued" : "proposed",
    owner_approved: false,
    mission_authorized: missionAuthorized === true,
    created_at: now,
    updated_at: now,
    attempt_count: 0,
    max_attempts: maxAttempts,
    next_run_at: null,
    checkpoint_summary: null,
    result_summary: null,
    evidence_refs: []
  };
  if (missionAuthorized === true && !isMissionAuthorizedTask(record)) throw new TypeError("Invalid mission-authorized task scope");
  const validation = validateTaskRecord(record);
  if (!validation.valid) throw new TypeError(`Invalid task record: ${validation.reason}`);
  return Object.freeze(record);
}

/** Return the already-created record for a repeated idempotency key; never create a second task. */
export function findIdempotentTask(tasks, idempotencyKey) {
  if (!Array.isArray(tasks) || !nonEmpty(idempotencyKey)) {
    throw new TypeError("Tasks and a non-empty idempotency key are required");
  }
  return tasks.find(task => task?.idempotency_key === idempotencyKey) ?? null;
}

/**
 * Select at most one due task. Any running task blocks another claim.
 * The caller must perform the final claim atomically in its persistent store.
 */
export function selectNextTask(tasks, { now = Date.now() } = {}) {
  if (!Array.isArray(tasks)) throw new TypeError("Tasks must be an array");
  if (tasks.some(task => task?.status === "running")) return null;
  const eligible = tasks.filter(task => {
    if (!validateTaskRecord(task).valid) return false;
    const dueQueued = task.status === "queued" && (!task.next_run_at || Date.parse(task.next_run_at) <= now);
    const dueWaiting = task.status === "waiting" && task.next_run_at !== null && task.next_run_at !== undefined && Date.parse(task.next_run_at) <= now;
    if (!dueQueued && !dueWaiting) return false;
    if (task.owner_approved !== true || task.mission_authorized === true) return false;
    if (task.attempt_count >= task.max_attempts) return false;
    return true;
  });
  eligible.sort((a, b) =>
    Date.parse(a.next_run_at ?? a.created_at) - Date.parse(b.next_run_at ?? b.created_at)
    || a.id.localeCompare(b.id)
  );
  return eligible[0] ?? null;
}

/** Pure transition helper. Storage must enforce expectedStatus atomically to prevent races. */
export function transitionTask(task, nextStatus, {
  expectedStatus = task?.status,
  ownerApproved = false,
  now = new Date().toISOString(),
  checkpointSummary,
  resultSummary,
  evidenceRefs,
  nextRunAt
} = {}) {
  const validation = validateTaskRecord(task);
  if (!validation.valid) throw new TypeError(`Invalid existing task: ${validation.reason}`);
  if (task.status !== expectedStatus) throw new Error("task_state_conflict");
  if (!TASK_STATUSES.includes(nextStatus) || !TRANSITIONS[task.status].has(nextStatus)) {
    throw new Error("invalid_task_transition");
  }
  if (task.status === "proposed" && nextStatus === "queued" && ownerApproved !== true) {
    throw new Error("owner_approval_required");
  }
  if (nextStatus === "queued" && task.owner_approved !== true && ownerApproved !== true) {
    throw new Error("owner_approval_required");
  }
  if (nextStatus === "running" && task.attempt_count >= task.max_attempts) {
    throw new Error("task_attempt_budget_exhausted");
  }
  const updated = {
    ...task,
    status: nextStatus,
    owner_approved: task.owner_approved || ownerApproved === true,
    updated_at: now
  };
  if (nextStatus === "running") {
    updated.attempt_count += 1;
    updated.started_at ??= now;
  }
  if (nextStatus === "succeeded" || nextStatus === "failed" || nextStatus === "cancelled") {
    updated.finished_at = now;
  }
  if (checkpointSummary !== undefined) updated.checkpoint_summary = checkpointSummary;
  if (resultSummary !== undefined) updated.result_summary = resultSummary;
  if (evidenceRefs !== undefined) updated.evidence_refs = [...evidenceRefs];
  if (nextStatus === "running") updated.next_run_at = null;
  else if (nextRunAt !== undefined) updated.next_run_at = nextRunAt;
  const after = validateTaskRecord(updated);
  if (!after.valid) throw new TypeError(`Invalid transitioned task: ${after.reason}`);
  return Object.freeze(updated);
}


/** A running task is recoverable only after its bounded execution lease expires. */
export function isTaskLeaseExpired(task, {
  now = Date.now(),
  leaseMs = 30 * 60 * 1000
} = {}) {
  if (!task || task.status !== "running" || !validTimestamp(task.updated_at)) return false;
  if (!Number.isFinite(now) || !Number.isFinite(leaseMs) || leaseMs < 1) {
    throw new TypeError("A finite clock and positive lease duration are required");
  }
  return now - Date.parse(task.updated_at) >= leaseMs;
}


/**
 * Compute the fail-closed migration patch for a legacy standing-mandate task.
 * The Worker applies this patch with a conditional SQL update; terminal history
 * and individually owner-approved state are preserved.
 */
export function revokeLegacyMissionAuthorization(row, now = new Date().toISOString()) {
  if (!row || row.mission_authorized !== 1) return null;
  const terminal = TERMINAL.has(row.status);
  return Object.freeze({
    mission_authorized: 0,
    status: row.owner_approved !== 1 && !terminal ? "proposed" : row.status,
    updated_at: now
  });
}

export const TASK_STATUS_VALUES = TASK_STATUSES;
