import test from "node:test";
import assert from "node:assert/strict";
import { canUseWriteTools, isExplicitReadOnlyTurn } from "../agent/lib/tool-access.ts";

process.env.VERCEL_ENV = "production";

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


test("Preview and local deployments never receive stateful tools", () => {
  process.env.OWNER_GITHUB_ID = "341732270";
  process.env.VERCEL_ENV = "preview";
  const owner = {
    ...base,
    session: { auth: { current: { authenticator: "github-owner", principalType: "user", principalId: "341732270" } } },
  };
  assert.equal(canUseWriteTools(owner), false);
  process.env.VERCEL_ENV = "production";
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

test("one explicitly authorized memory write is not blocked by limits on other records", () => {
  const prompt = [
    "I explicitly authorize one controlled persistent-memory connectivity test.",
    'Generate one experience record using "memory_record_experience".',
    "Do not create another record if the first write succeeds.",
    "Do not modify, approve, delete, or overwrite any other memory.",
    "Do not perform any unrelated tasks.",
  ].join("\n");
  assert.equal(isExplicitReadOnlyTurn(prompt), false);
});

test("a global no-write instruction still overrides a bounded write authorization", () => {
  const prompt = [
    "I explicitly authorize one controlled persistent-memory connectivity test.",
    'Generate one experience record using "memory_record_experience".',
    "Do not write anything in this turn.",
  ].join("\n");
  assert.equal(isExplicitReadOnlyTurn(prompt), true);
});
