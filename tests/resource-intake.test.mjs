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

test("rejects duplicate tags and invalid cost metadata", () => {
  assert.throws(() => prepareResourceCandidate({ ...base, skill_tags: ["coding", "coding"] }), /Duplicate values/);
  assert.throws(() => prepareResourceCandidate({ ...base, cost_model: "free probably" }), /Invalid cost_model/);
});

test("does not allow callers to mark candidates approved", () => {
  assert.throws(() => prepareResourceCandidate({ ...base, trust_state: "approved" }), /Unsupported resource field/);
});
