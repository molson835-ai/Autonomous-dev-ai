const MAX_CHECKPOINT_BYTES = 32 * 1024;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const STATUSES = new Set(["pending", "running", "paused", "completed", "failed"]);

function bytes(value) { return new TextEncoder().encode(value).byteLength; }

/** Validate a portable, data-only checkpoint. This module does not persist or resume tasks. */
export function validateExecutionCheckpoint(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false, reason: "Checkpoint object required." };
  const allowed = new Set(["taskId", "checkpointId", "sequence", "status", "provider", "profile", "createdAt", "payload"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return { valid: false, reason: "Unsupported checkpoint property." };
  if (typeof value.taskId !== "string" || !ID.test(value.taskId) ||
      typeof value.checkpointId !== "string" || !ID.test(value.checkpointId) ||
      !Number.isSafeInteger(value.sequence) || value.sequence < 0 ||
      !STATUSES.has(value.status) || !["vercel", "cloudflare", "none"].includes(value.provider) ||
      typeof value.profile !== "string" || !/^[a-z0-9-]{1,48}$/.test(value.profile) ||
      typeof value.createdAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value.createdAt)) {
    return { valid: false, reason: "Checkpoint metadata is invalid." };
  }
  if (!value.payload || typeof value.payload !== "object" || Array.isArray(value.payload)) return { valid: false, reason: "Checkpoint payload must be a data object." };

  // JSON is the portable checkpoint format. Reject values it cannot safely encode
  // (including cycles and BigInt) rather than letting serialization throw upstream.
  let serializedPayload;
  let serializedCheckpoint;
  try {
    serializedPayload = JSON.stringify(value.payload);
    serializedCheckpoint = JSON.stringify(value);
  } catch {
    return { valid: false, reason: "Checkpoint payload must contain only safely serializable data." };
  }
  if (typeof serializedPayload !== "string" || typeof serializedCheckpoint !== "string") {
    return { valid: false, reason: "Checkpoint payload must contain only safely serializable data." };
  }
  if (bytes(serializedPayload) > MAX_CHECKPOINT_BYTES) return { valid: false, reason: "Checkpoint payload exceeds 32 KiB." };
  if (/token|secret|password|credential|api[_-]?key|authorization/i.test(serializedPayload)) {
    return { valid: false, reason: "Checkpoint payload appears to contain credential-like data." };
  }
  try {
    return { valid: true, checkpoint: JSON.parse(serializedCheckpoint), maxPayloadBytes: MAX_CHECKPOINT_BYTES, status: "validated_not_persisted" };
  } catch {
    return { valid: false, reason: "Checkpoint could not be safely copied." };
  }
}

export function canResumeCheckpoint(checkpoint, expected) {
  const checked = validateExecutionCheckpoint(checkpoint);
  if (!checked.valid) return { valid: false, resumable: false, reason: checked.reason };
  if (!expected || checkpoint.taskId !== expected.taskId || checkpoint.sequence !== expected.sequence ||
      checkpoint.status !== "paused" || expected.ownerApproved !== true) {
    return { valid: true, resumable: false, reason: "Resume requires matching task/sequence, paused state, and explicit owner approval." };
  }
  return { valid: true, resumable: true, status: "resume_eligibility_only" };
}
