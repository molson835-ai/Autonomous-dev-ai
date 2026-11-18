export function ownerDiagnosticGateReason({ ownerSessionValid, accessToken, sharedSecret }) {
  if (!ownerSessionValid || typeof accessToken !== "string" || !accessToken || accessToken.length > 4096) {
    return "owner_session_invalid";
  }
  if (typeof sharedSecret !== "string" || !sharedSecret) return "server_shared_secret_missing";
  return null;
}

export function normalizeOwnerDiagnosticPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      typeof payload.reason_code !== "string" || !payload.reason_code) {
    return { reason_code: "diagnostic_response_invalid" };
  }
  return payload;
}

export const OWNER_DIAGNOSTIC_WORKER_UNAVAILABLE = Object.freeze({
  reason_code: "worker_service_unavailable",
});
