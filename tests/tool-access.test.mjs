import test from "node:test";
import assert from "node:assert/strict";
import { canUseWriteTools, isExplicitReadOnlyTurn } from "../agent/lib/tool-access.ts";

const base = { session: { auth: { current: null }, schedule: null }, turn: { input: "Check current status." } };

test("anonymous chat does not receive stateful tools", () => {
  assert.equal(canUseWriteTools(base), false);
});

test("verified owner receives stateful tools outside read-only turns", () => {
  process.env.OWNER_GITHUB_ID = "341732270";
  const context = {
    ...base,
    session: { auth: { current: { authenticator: "github-owner", principalType: "user", principalId: "341732270" } } },
  };
  assert.equal(canUseWriteTools(context), true);
});

test("trusted Vercel service and scheduled sessions retain work-loop tools", () => {
  const service = {
    ...base,
    session: { auth: { current: { authenticator: "vercel-oidc", principalType: "service", principalId: "deployment" } } },
  };
  const scheduled = { ...base, session: { auth: { current: null }, schedule: { id: "daily-eve" } } };
  assert.equal(canUseWriteTools(service), true);
  assert.equal(canUseWriteTools(scheduled), true);
});

test("explicit read-only request overrides owner, service, and schedule permissions", () => {
  process.env.OWNER_GITHUB_ID = "341732270";
  const owner = {
    ...base,
    session: { auth: { current: { authenticator: "github-owner", principalType: "user", principalId: "341732270" } } },
    turn: { input: "Perform a read-only check. Do not write anything." },
  };
  const scheduled = { ...base, session: { auth: { current: null }, schedule: { id: "daily-eve" } }, turn: { input: "Read-only diagnostic only." } };
  assert.equal(canUseWriteTools(owner), false);
  assert.equal(canUseWriteTools(scheduled), false);
});

test("read-only detection handles structured message content", () => {
  assert.equal(isExplicitReadOnlyTurn([{ type: "text", text: "Please do not save or modify anything." }]), true);
  assert.equal(isExplicitReadOnlyTurn({ content: [{ text: "This is a read-only audit." }] }), true);
  assert.equal(isExplicitReadOnlyTurn("Continue approved work and record the verified result."), false);
});
