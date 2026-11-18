import test from "node:test";
import assert from "node:assert/strict";
import {
  OWNER_DIAGNOSTIC_WORKER_UNAVAILABLE,
  normalizeOwnerDiagnosticPayload,
  ownerDiagnosticGateReason,
} from "../apps/web/lib/owner-diagnostic-response.mjs";

test("owner diagnostic gate reports an invalid owner session", () => {
  assert.equal(ownerDiagnosticGateReason({
    ownerSessionValid: false,
    accessToken: "session-token",
    sharedSecret: "server-secret",
  }), "owner_session_invalid");
  assert.equal(ownerDiagnosticGateReason({
    ownerSessionValid: true,
    accessToken: "",
    sharedSecret: "server-secret",
  }), "owner_session_invalid");
});

test("owner diagnostic gate reports a missing server shared secret", () => {
  assert.equal(ownerDiagnosticGateReason({
    ownerSessionValid: true,
    accessToken: "session-token",
    sharedSecret: "",
  }), "server_shared_secret_missing");
});

test("owner diagnostic gate permits only a valid owner session and server secret", () => {
  assert.equal(ownerDiagnosticGateReason({
    ownerSessionValid: true,
    accessToken: "session-token",
    sharedSecret: "server-secret",
  }), null);
});

test("malformed Worker responses receive a distinct safe reason code", () => {
  assert.deepEqual(normalizeOwnerDiagnosticPayload(null), {
    reason_code: "diagnostic_response_invalid",
  });
  assert.deepEqual(normalizeOwnerDiagnosticPayload({ error: "unexpected" }), {
    reason_code: "diagnostic_response_invalid",
  });
});

test("Worker transport failures receive a distinct safe reason code", () => {
  assert.deepEqual(OWNER_DIAGNOSTIC_WORKER_UNAVAILABLE, {
    reason_code: "worker_service_unavailable",
  });
});
