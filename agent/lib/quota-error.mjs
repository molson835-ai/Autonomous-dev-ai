const SAFE_QUOTA_MESSAGES = Object.freeze({
  local_neuron_budget_reached: "Eve's local neuron safety target has been reached. This is a conservative local estimate, not proof that Cloudflare's free allocation is exhausted.",
  quota_circuit_open: "Cloudflare rejected a previous Workers AI request for provider quota exhaustion. Eve has paused model calls and will not retry or switch to a paid provider.",
  quota_telemetry_unavailable: "Eve cannot verify current Workers AI usage, so model calls are paused to protect the account.",
  quota_telemetry_regressed: "Cloudflare usage telemetry moved backwards. Eve has paused model calls until usage can be verified."
});

const SAFE_REASON_CODES = new Set(Object.keys(SAFE_QUOTA_MESSAGES));

function safeReasonCode(payload) {
  const reason = payload && typeof payload === "object" ? payload.reason_code : undefined;
  return typeof reason === "string" && SAFE_REASON_CODES.has(reason) ? reason : "unclassified";
}

function endpointCategory(path) {
  if (typeof path !== "string") return "memory";
  if (path.startsWith("/v1/quota/reserve")) return "quota_reservation";
  if (path.startsWith("/v1/quota/settle")) return "quota_settlement";
  if (path.startsWith("/v1/quota/circuit")) return "quota_circuit";
  if (path.startsWith("/v1/quota/")) return "quota";
  return "memory";
}

export function memoryFailureMessage(status, payload) {
  const reason = safeReasonCode(payload);
  if (status === 429 && reason !== "unclassified") return SAFE_QUOTA_MESSAGES[reason];
  if (status === 503 && reason !== "unclassified") return SAFE_QUOTA_MESSAGES[reason];
  return `Persistent memory request failed (${status}).`;
}

/**
 * Safe, low-cardinality diagnostic metadata for logs. Never includes response
 * bodies, URLs, credentials, task content, or arbitrary provider messages.
 */
export function memoryFailureDiagnostic(status, payload, path) {
  const category = endpointCategory(path);
  const reason = safeReasonCode(payload);
  const message = memoryFailureMessage(status, payload);
  const suffix = `[category=${category}; reason_code=${reason}]`;
  const name = category === "quota_reservation"
    ? "EVEQuotaReservationError"
    : category.startsWith("quota_") || category === "quota"
      ? "EVEQuotaGuardError"
      : "PersistentMemoryHttpError";
  return { name, message: `${message} ${suffix}`, status, category, reason_code: reason };
}
