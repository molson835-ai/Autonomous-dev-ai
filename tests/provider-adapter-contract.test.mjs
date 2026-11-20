import test from "node:test";
import assert from "node:assert/strict";
import { createProviderAdapter } from "../agent/lib/provider-adapter-contract.mjs";
import { evaluateProviderReadiness } from "../agent/lib/provider-readiness-policy.mjs";

function makeClient() {
  const calls = [];
  return {
    calls,
    create: (...args) => calls.push(["create", ...args]),
    stop: (...args) => calls.push(["stop", ...args]),
  };
}

test("both provider adapters prepare bounded descriptors without invoking clients", () => {
  for (const provider of ["vercel", "cloudflare"]) {
    const client = makeClient();
    const adapter = createProviderAdapter({ provider, client });
    const result = adapter.prepare({ profile: "node-test-pure-js", inputBytes: 128 });
    assert.equal(result.valid, true);
    assert.equal(result.status, "prepared_not_executed");
    assert.equal(result.provider, provider);
    assert.equal(result.activationAllowed, false);
    assert.equal(result.configuration.networkPolicy, "deny-all");
    assert.equal(result.configuration.persistent, false);
    assert.equal(result.configuration.credentials, false);
    assert.deepEqual(client.calls, []);
  }
});

test("adapter rejects missing clients, unknown providers, and malformed requests", () => {
  assert.throws(() => createProviderAdapter({ provider: "vercel" }), /client/);
  assert.throws(() => createProviderAdapter({ provider: "e2b", client: makeClient() }), /provider/i);
  const adapter = createProviderAdapter({ provider: "vercel", client: makeClient() });
  assert.equal(adapter.prepare({ profile: "node-test-pure-js", inputBytes: 90000 }).valid, false);
  assert.equal(adapter.prepare({ profile: "node-test-pure-js", inputBytes: 1, command: "id" }).valid, false);
});

test("provider readiness blocks missing, false, malformed, and stale evidence", () => {
  const base = {
    provider: "cloudflare",
    ownerApproved: true,
    now: "2026-11-20T12:00:00Z",
    evidence: Object.fromEntries(["planEligibility", "commercialUse", "usageLimits", "billingControls", "isolationControls"].map((key) => [key, {
      verified: true, evidenceRef: "https://evidence.example/" + key, checkedAt: "2026-11-20T11:00:00Z",
    }])),
  };
  assert.equal(evaluateProviderReadiness({ ...base, evidence: {} }).status, "blocked");
  assert.equal(evaluateProviderReadiness({ ...base, evidence: { ...base.evidence, commercialUse: { ...base.evidence.commercialUse, verified: false } } }).status, "blocked");
  assert.equal(evaluateProviderReadiness({ ...base, evidence: { ...base.evidence, billingControls: { ...base.evidence.billingControls, evidenceRef: "" } } }).status, "blocked");
  assert.equal(evaluateProviderReadiness({ ...base, evidence: { ...base.evidence, isolationControls: { ...base.evidence.isolationControls, checkedAt: "2026-11-01T11:00:00Z" } } }).status, "blocked");
  assert.equal(evaluateProviderReadiness({ ...base, ownerApproved: false }).status, "blocked");
  assert.equal(evaluateProviderReadiness({ ...base, provider: "unknown" }).status, "blocked");
});

test("complete readiness evidence permits only a separate activation review, never activation", () => {
  const evidence = Object.fromEntries(["planEligibility", "commercialUse", "usageLimits", "billingControls", "isolationControls"].map((key) => [key, {
    verified: true, evidenceRef: "https://evidence.example/" + key, checkedAt: "2026-11-20T11:00:00Z",
  }]));
  const result = evaluateProviderReadiness({ provider: "vercel", ownerApproved: true, now: "2026-11-20T12:00:00Z", evidence });
  assert.equal(result.status, "ready_for_separate_activation_review");
  assert.equal(result.activationAllowed, false);
  assert.equal(result.provider, "vercel");
});
