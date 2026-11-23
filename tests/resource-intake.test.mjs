import assert from "node:assert/strict";
import test from "node:test";
import { isResourceHostAllowed, prepareResourceCandidate } from "../agent/resources/intake.mjs";

const base = {
  id: "mdn.fetch",
  name: "Fetch API",
  summary: "Reference for browser network requests.",
  resource_type: "documentation",
  skill_tags: ["web-platform", "javascript"],
  source_url: "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API",
  maintainer: "MDN contributors",
  license: "CC-BY-SA-2.5",
  version_or_revision: "current",
  cost_model: "free_open_source",
  dependencies: [],
  permissions: ["read public documentation"],
  network_or_execution_requirements: ["HTTPS read only"],
  security_notes: "Documentation only; no code executed."
};

test("prepares a provenance-rich candidate in quarantine without approval metadata", () => {
  const entry = prepareResourceCandidate(base, new Date("2026-11-13T00:00:00.000Z"));
  assert.equal(entry.trust_state, "quarantined");
  assert.equal(entry.source_url, base.source_url);
  assert.equal(entry.license, base.license);
  assert.equal(entry.cost_model, "free_open_source");
  assert.equal(entry.retrieved_at, "2026-11-13T00:00:00.000Z");
  assert.equal("reviewer" in entry, false);
  assert.equal("review_evidence" in entry, false);
});

test("uses explicit unknown metadata rather than guessing", () => {
  const entry = prepareResourceCandidate({
    ...base, maintainer: undefined, license: undefined, version_or_revision: undefined,
    cost_model: undefined
  }, "2026-11-13T00:00:00.000Z");
  assert.equal(entry.maintainer, "unknown");
  assert.equal(entry.license, "unknown");
  assert.equal(entry.version_or_revision, "unknown");
  assert.equal(entry.cost_model, "unknown");
});

test("accepts only HTTPS sources on exact allowlisted hosts", () => {
  for (const url of [
    "http://developer.mozilla.org/docs",
    "https://evil.example/developer.mozilla.org",
    "https://developer.mozilla.org.evil.example/",
    "https://user:pass@developer.mozilla.org/",
    "https://developer.mozilla.org:8443/"
  ]) assert.equal(isResourceHostAllowed(url), false, url);
  assert.equal(isResourceHostAllowed(base.source_url), true);
});

test("rejects unknown fields, malformed identifiers, and invalid resource types", () => {
  assert.throws(() => prepareResourceCandidate({ ...base, execute: true }), /Unsupported resource field/);
  assert.throws(() => prepareResourceCandidate({ ...base, id: "../secret" }), /Invalid resource id/);
  assert.throws(() => prepareResourceCandidate({ ...base, resource_type: "executable" }), /Invalid resource_type/);
});

test("rejects duplicate and blank list entries and invalid cost metadata", () => {
  for (const candidate of [
    { ...base, skill_tags: ["coding", "coding"] },
    { ...base, skill_tags: ["  "] },
    { ...base, permissions: [""] },
    { ...base, dependencies: ["  "] },
    { ...base, cost_model: "free probably" }
  ]) assert.throws(() => prepareResourceCandidate(candidate));
});

test("deep-freezes the candidate and all nested arrays", () => {
  const entry = prepareResourceCandidate(base);
  assert.equal(Object.isFrozen(entry), true);
  assert.equal(Object.isFrozen(entry.skill_tags), true);
  assert.equal(Object.isFrozen(entry.permissions), true);
  assert.throws(() => entry.skill_tags.push("execute"));
});

test("aligns intake bounds with the schema", () => {
  assert.throws(() => prepareResourceCandidate({ ...base, skill_tags: ["x".repeat(101)] }));
  assert.throws(() => prepareResourceCandidate({ ...base, freshness_policy: "x".repeat(1001) }));
  assert.doesNotThrow(() => prepareResourceCandidate({ ...base, cost_notes: "x".repeat(2000) }));
});

test("rejects malformed, date-only, and impossible timestamps", () => {
  for (const value of ["2026-11-13", "2026-02-30T00:00:00Z", "not-a-date", "2026-11-13T00:00:00"]) {
    assert.throws(() => prepareResourceCandidate({ ...base, retrieved_at: value }));
  }
  assert.throws(() => prepareResourceCandidate(base, "not-a-date"));
});

test("does not allow callers to mark candidates approved", () => {
  assert.throws(() => prepareResourceCandidate({ ...base, trust_state: "approved" }), /Unsupported resource field/);
});


test("adds conservative capability and access metadata with safe defaults", () => {
  const entry = prepareResourceCandidate(base);
  assert.equal(entry.access_mode, "public_read");
  assert.equal(entry.persistence, "unknown");
  assert.equal(entry.execution, "none");
  assert.deepEqual(entry.data_classes_allowed, ["public"]);
  assert.equal(entry.commercial_use, "unknown");
  assert.deepEqual(entry.quota_evidence, { limits: "unknown", confidence: "unknown" });
  assert.equal(entry.adapter_status, "candidate");
  assert.equal(entry.failure_policy, "manual_review");
  assert.equal(entry.deletion_and_export, "unknown");
});

test("accepts additional resource families but keeps every candidate quarantined", () => {
  for (const resource_type of ["api", "library", "compute", "storage", "asset"]) {
    const entry = prepareResourceCandidate({ ...base, resource_type });
    assert.equal(entry.resource_type, resource_type);
    assert.equal(entry.trust_state, "quarantined");
    assert.equal(entry.adapter_status, "candidate");
  }
});

test("validates explicit access, data, commercial, quota and adapter metadata", () => {
  const entry = prepareResourceCandidate({
    ...base,
    access_mode: "local_only",
    persistence: "ephemeral",
    execution: "browser_local",
    data_classes_allowed: ["public", "owner_selected_local"],
    commercial_use: "conditional",
    quota_evidence: {
      source_url: "https://developers.cloudflare.com/workers-ai/platform/pricing/",
      checked_at: "2026-11-23T00:00:00Z",
      limits: "Account-specific allowance must be verified.",
      confidence: "medium"
    },
    adapter_status: "implemented",
    failure_policy: "pause",
    deletion_and_export: "Local working data can be exported and deleted by the user."
  });
  assert.equal(entry.access_mode, "local_only");
  assert.deepEqual(entry.data_classes_allowed, ["public", "owner_selected_local"]);
  assert.equal(entry.quota_evidence.confidence, "medium");
  assert.equal(entry.adapter_status, "implemented");
  assert.equal(entry.trust_state, "quarantined");
});

test("rejects unknown capability enums, private defaults and unsafe quota evidence", () => {
  for (const candidate of [
    { ...base, access_mode: "anonymous-unlimited" },
    { ...base, persistence: "forever" },
    { ...base, execution: "arbitrary_shell" },
    { ...base, data_classes_allowed: ["public", "secret"] },
    { ...base, commercial_use: "probably" },
    { ...base, adapter_status: "active" },
    { ...base, failure_policy: "ignore" },
    { ...base, quota_evidence: { confidence: "high", limits: "Unlimited" } },
    { ...base, quota_evidence: { source_url: "http://example.com", confidence: "low", checked_at: "2026-11-23T00:00:00Z" } },
    { ...base, quota_evidence: { source_url: "https://example.com", confidence: "medium" } },
    { ...base, quota_evidence: { source_url: "https://example.com", checked_at: "2026-11-23T00:00:00Z", confidence: "medium", extra: true } }
  ]) assert.throws(() => prepareResourceCandidate(candidate));
});

test("keeps new metadata deeply immutable and refuses caller-supplied trust promotion", () => {
  const entry = prepareResourceCandidate({
    ...base,
    data_classes_allowed: ["public"],
    quota_evidence: { confidence: "unknown" }
  });
  assert.equal(Object.isFrozen(entry.quota_evidence), true);
  assert.equal(Object.isFrozen(entry.data_classes_allowed), true);
  assert.throws(() => prepareResourceCandidate({ ...base, trust_state: "approved" }), /Unsupported resource field/);
});
