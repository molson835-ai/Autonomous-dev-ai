import test from "node:test";
import assert from "node:assert/strict";
import { createOwnerSession, verifyOwnerSession } from "../apps/web/lib/owner-session.mjs";

const secret = "test-only-owner-session-signing-secret-32-bytes-minimum";
const ownerId = "341732270";

test("creates and verifies an app-issued owner session for the immutable owner ID", () => {
  const token = createOwnerSession(ownerId, secret, 1_800_000_000);
  assert.equal(verifyOwnerSession(token, secret, ownerId, 1_800_000_001), true);
});

test("rejects a token for another GitHub account and an arbitrary GitHub OAuth token", () => {
  const token = createOwnerSession(ownerId, secret, 1_800_000_000);
  assert.equal(verifyOwnerSession(token, secret, "123456789", 1_800_000_001), false);
  assert.equal(verifyOwnerSession("gho_owner_account_token_from_another_oauth_app", secret, ownerId, 1_800_000_001), false);
});

test("rejects tampered, expired, future-dated, and wrong-secret sessions", () => {
  const token = createOwnerSession(ownerId, secret, 1_800_000_000);
  const [payload, signature] = token.split(".");
  const tampered = payload.slice(0, -1) + (payload.endsWith("a") ? "b" : "a") + "." + signature;
  assert.equal(verifyOwnerSession(tampered, secret, ownerId, 1_800_000_001), false);
  assert.equal(verifyOwnerSession(token, secret, ownerId, 1_800_028_801), false);
  const future = createOwnerSession(ownerId, secret, 1_800_000_100);
  assert.equal(verifyOwnerSession(future, secret, ownerId, 1_800_000_000), false);
  assert.equal(verifyOwnerSession(token, "different-owner-signing-secret-32-bytes-minimum", ownerId, 1_800_000_001), false);
});

test("refuses to issue sessions without an immutable numeric owner ID and strong secret", () => {
  assert.throws(() => createOwnerSession("owner-login", secret, 1_800_000_000), /invalid_owner_id/);
  assert.throws(() => createOwnerSession(ownerId, "too-short", 1_800_000_000), /owner_session_signing_secret_missing/);
});
