import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const schema = JSON.parse(readFileSync("agent/resources/catalog.schema.json", "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);

function validEntry(overrides = {}) {
  return {
    id: "docs.example",
    name: "Example docs",
    summary: "Reference documentation for a bounded test.",
    resource_type: "documentation",
    skill_tags: ["research"],
    source_url: "https://example.com/docs",
    maintainer: "Example maintainers",
    license: "unknown",
    version_or_revision: "v1",
    cost_model: "unknown",
    dependencies: [],
    permissions: [],
    network_or_execution_requirements: ["HTTPS read only"],
    trust_state: "quarantined",
    security_notes: "Not executed; awaiting review.",
    retrieved_at: "2026-11-13T00:00:00.000Z",
    last_verified_at: "2026-11-13T00:00:00.000Z",
    ...overrides
  };
}

test("compiles as a standards-based JSON Schema 2020-12 contract", () => {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.doesNotThrow(() => ajv.compile(schema));
});

test("accepts a complete quarantined resource with explicit unknown metadata", () => {
  assert.equal(validate(validEntry()), true, JSON.stringify(validate.errors));
});

test("rejects missing provenance, malformed identifiers, invalid URLs, and unknown fields", () => {
  for (const entry of [
    validEntry({ license: undefined }),
    validEntry({ id: "Not Valid!" }),
    validEntry({ source_url: "javascript:alert(1)" }),
    validEntry({ surprise_permission: true })
  ]) assert.equal(validate(entry), false, JSON.stringify(entry));
});

test("rejects invalid enums, duplicate tags, blank list values, and overlong metadata", () => {
  for (const entry of [
    validEntry({ trust_state: "trusted" }),
    validEntry({ cost_model: "free-ish" }),
    validEntry({ skill_tags: ["research", "research"] }),
    validEntry({ skill_tags: ["  "] }),
    validEntry({ dependencies: [""] }),
    validEntry({ summary: "x".repeat(2001) })
  ]) assert.equal(validate(entry), false);
});

test("enforces RFC 3339 date-time formats", () => {
  for (const timestamp of ["2026-11-13", "not-a-date", "2026-02-30T00:00:00Z", "2026-11-13T00:00:00"]) {
    assert.equal(validate(validEntry({ retrieved_at: timestamp })), false, timestamp);
  }
});

test("approved resources require a reviewer, review timestamp, and evidence", () => {
  assert.equal(validate(validEntry({ trust_state: "approved" })), false);
  const approved = validEntry({
    trust_state: "approved",
    reviewer: "owner",
    reviewed_at: "2026-11-13T00:00:00.000Z",
    review_evidence: ["Pinned revision inspected; permissions reviewed."]
  });
  assert.equal(validate(approved), true, JSON.stringify(validate.errors));
});
