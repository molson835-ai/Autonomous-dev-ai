import test from "node:test";
import assert from "node:assert/strict";
import { canUseWriteTools, isExplicitReadOnlyTurn } from "../agent/lib/tool-access.ts";

process.env.VERCEL_ENV = "production";

const base = { session: { auth: { current: null }, schedule: null }, turn: { input: "Check current status." } };
const scheduleAuth = { authenticator: "app", principalId: "eve:app", principalType: "runtime" };

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

test("trusted Vercel service principal retains internal work-loop tools", () => {
  const service = {
    ...base,
    session: { auth: { current: { authenticator: "vercel-oidc", principalType: "service", principalId: "deployment" } } },
  };
  assert.equal(canUseWriteTools(service), true);
});

test("only the owner-approved work-loop schedule with Eve app identity receives scheduled write tools", () => {
  const authorized = {
    ...base,
    session: { auth: { current: scheduleAuth }, schedule: { definition: "owner-approved-work-loop" } },
  };
  assert.equal(canUseWriteTools(authorized), true);
});

test("an arbitrary schedule cannot obtain stateful tools", () => {
  const arbitrarySchedule = {
    ...base,
    session: { auth: { current: scheduleAuth }, schedule: { definition: "unrelated-maintenance" } },
  };
  assert.equal(canUseWriteTools(arbitrarySchedule), false);
});

test("schedule metadata without Eve's framework app identity cannot obtain stateful tools", () => {
  const userPrincipal = {
    ...base,
    session: {
      auth: { current: null },
      schedule: { definition: "owner-approved-work-loop" },
    },
  };
  const wrongAppPrincipal = {
    ...base,
    session: {
      auth: { current: { authenticator: "app", principalType: "runtime", principalId: "other:app" } },
      schedule: { definition: "owner-approved-work-loop" },
    },
  };
  assert.equal(canUseWriteTools(userPrincipal), false);
  assert.equal(canUseWriteTools(wrongAppPrincipal), false);
});

test("Eve app identity without the approved schedule cannot obtain stateful tools", () => {
  const appWithoutSchedule = {
    ...base,
    session: { auth: { current: scheduleAuth }, schedule: null },
  };
  assert.equal(canUseWriteTools(appWithoutSchedule), false);
});

test("explicit read-only request overrides owner, service, and scheduled permissions", () => {
  process.env.OWNER_GITHUB_ID = "341732270";
  const owner = {
    ...base,
    session: { auth: { current: { authenticator: "github-owner", principalType: "user", principalId: "341732270" } } },
    turn: { input: "Perform a read-only check. Do not write anything." },
  };
  const service = {
    ...base,
    session: { auth: { current: { authenticator: "vercel-oidc", principalType: "service", principalId: "deployment" } } },
    turn: { input: "Read-only diagnostic only." },
  };
  const scheduled = {
    ...base,
    session: { auth: { current: scheduleAuth }, schedule: { definition: "owner-approved-work-loop" } },
    turn: { input: "Read-only diagnostic only." },
  };
  assert.equal(canUseWriteTools(owner), false);
  assert.equal(canUseWriteTools(service), false);
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
