const SAFE_QUOTA_MESSAGES = Object.freeze({
  local_neuron_budget_reached: "Eve's local neuron safety target has been reached. This is a conservative local estimate, not proof that Cloudflare's free allocation is exhausted.",
  quota_circuit_open: "Cloudflare rejected a previous Workers AI request for provider quota exhaustion. Eve has paused model calls and will not retry or switch to a paid provider.",
  quota_telemetry_unavailable: "Eve cannot verify current Workers AI usage, so model calls are paused to protect the account.",
  quota_telemetry_regressed: "Cloudflare usage telemetry moved backwards. Eve has paused model calls until usage can be verified."
});

export function memoryFailureMessage(status, payload) {
  const reason = payload && typeof payload === "object" ? payload.reason_code : undefined;
  if (status === 429 && typeof reason === "string" && SAFE_QUOTA_MESSAGES[reason]) {
    return SAFE_QUOTA_MESSAGES[reason];
  }
  if (status === 503 && typeof reason === "string" && SAFE_QUOTA_MESSAGES[reason]) {
    return SAFE_QUOTA_MESSAGES[reason];
  }
  return `Persistent memory request failed (${status}).`;
}
