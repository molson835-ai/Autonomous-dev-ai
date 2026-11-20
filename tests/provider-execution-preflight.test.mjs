import test from "node:test";
import assert from "node:assert/strict";
import { evaluateProviderExecutionPreflight } from "../agent/lib/provider-execution-preflight.mjs";

const categories = ["planEligibility", "commercialUse", "usageLimits", "billingControls", "isolationControls"];
function fixtures(provider = "cloudflare", utilization = 20) {
  const now = "2026-11-20T12:00:00Z";
  const evidence = Object.fromEntries(categories.map((key) => [key, {
    verified: true,
    evidenceRef: `https://evidence.example/${key}`,
    checkedAt: "2026-11-20T11:00:00Z",
  }]));
  return {
    request: { provider, profile: "node-test-pure-js", inputBytes: 256 },
    readiness: { provider, ownerApproved: true, now, evidence },
    usage: {
      provider, period: "2026-11", sourceVerified: true, currency: "USD",
      cpuUsed: utilization, cpuLimit: 100,
    },
  };
}

test("matching fresh readiness and verified in-budget usage pass preflight without execution authority", () => {
  const result = evaluateProviderExecutionPreflight(fixtures());
  assert.equal(result.valid, true);
  assert.equal(result.status, "preflight_passed_not_executed");
  assert.equal(result.activationAllowed, false);
  assert.equal(result.executionAllowed, false);
  assert.equal(result.nextStep, "separate_owner_activation_approval");
});

test("missing or mismatched readiness blocks", () => {
  const input = fixtures();
  assert.equal(evaluateProviderExecutionPreflight({ ...input, readiness: { ...input.readiness, ownerApproved: false } }).status, "blocked");
  assert.equal(evaluateProviderExecutionPreflight({ ...input, readiness: { ...input.readiness, provider: "vercel" } }).status, "blocked");
});

test("missing, unverified, mismatched, or threshold-exceeding usage blocks", () => {
  const input = fixtures();
  assert.equal(evaluateProviderExecutionPreflight({ ...input, usage: { ...input.usage, sourceVerified: false } }).status, "blocked");
  assert.equal(evaluateProviderExecutionPreflight({ ...input, usage: { ...input.usage, provider: "vercel" } }).status, "blocked");
  assert.equal(evaluateProviderExecutionPreflight(fixtures("cloudflare", 90)).status, "blocked");
  assert.equal(evaluateProviderExecutionPreflight(fixtures("cloudflare", 100)).status, "blocked");
});

test("invalid execution requests and unknown fields fail closed", () => {
  const input = fixtures();
  assert.equal(evaluateProviderExecutionPreflight({ ...input, request: { ...input.request, shell: true } }).status, "blocked");
  assert.equal(evaluateProviderExecutionPreflight({ ...input, surprise: true }).status, "blocked");
  assert.equal(evaluateProviderExecutionPreflight(null).status, "blocked");
});

test("a complete preflight never enables execution or activation", () => {
  for (const provider of ["vercel", "cloudflare"]) {
    const result = evaluateProviderExecutionPreflight(fixtures(provider));
    assert.equal(result.activationAllowed, false);
    assert.equal(result.executionAllowed, false);
  }
});
