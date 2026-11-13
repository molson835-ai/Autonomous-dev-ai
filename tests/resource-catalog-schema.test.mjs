import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = JSON.parse(readFileSync("agent/resources/catalog.schema.json", "utf8"));

function errorsFor(value, rule, path = "$") {
  const errors = [];
  const types = Array.isArray(rule.type) ? rule.type : rule.type ? [rule.type] : [];
  const matches = (type) => type === "null" ? value === null
    : type === "array" ? Array.isArray(value)
    : type === "object" ? value !== null && typeof value === "object" && !Array.isArray(value)
    : type === "integer" ? Number.isInteger(value)
    : type === "number" ? typeof value === "number" && Number.isFinite(value)
    : type === "string" ? typeof value === "string"
    : type === "boolean" ? typeof value === "boolean" : true;
  if (types.length && !types.some(matches)) return [`${path}: type`];
  if (rule.const !== undefined && value !== rule.const) errors.push(`${path}: const`);
  if (rule.enum && !rule.enum.includes(value)) errors.push(`${path}: enum`);
  if (typeof value === "string") {
    if (rule.minLength !== undefined && value.length < rule.minLength) errors.push(`${path}: minLength`);
    if (rule.maxLength !== undefined && value.length > rule.maxLength) errors.push(`${path}: maxLength`);
    if (rule.pattern && !(new RegExp(rule.pattern).test(value))) errors.push(`${path}: pattern`);
    if (rule.format === "uri") {
      try { const url = new URL(value); if (!url.protocol || !url.host) errors.push(`${path}: uri`); }
      catch { errors.push(`${path}: uri`); }
    }
    if (rule.format === "date-time" && (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value)))) errors.push(`${path}: date-time`);
  }
  if (Array.isArray(value)) {
    if (rule.maxItems !== undefined && value.length > rule.maxItems) errors.push(`${path}: maxItems`);
    if (rule.minItems !== undefined && value.length < rule.minItems) errors.push(`${path}: minItems`);
    if (rule.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) errors.push(`${path}: uniqueItems`);
    if (rule.items) value.forEach((item, i) => errors.push(...errorsFor(item, rule.items, `${path}[${i}]`)));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of rule.required ?? []) if (!(key in value)) errors.push(`${path}.${key}: required`);
    if (rule.additionalProperties === false) for (const key of Object.keys(value)) if (!(key in (rule.properties ?? {}))) errors.push(`${path}.${key}: additionalProperties`);
    for (const [key, childRule] of Object.entries(rule.properties ?? {})) {
      if (key in value) errors.push(...errorsFor(value[key], childRule, `${path}.${key}`));
    }
    for (const condition of rule.allOf ?? []) {
      const conditionMatches = errorsFor(value, condition.if).length === 0;
      if (conditionMatches) errors.push(...errorsFor(value, condition.then, path));
    }
  }
  return errors;
}

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

test("catalog schema declares provenance, cost, trust, and review requirements", () => {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  for (const field of ["source_url", "maintainer", "license", "version_or_revision", "cost_model", "trust_state", "retrieved_at", "last_verified_at"]) {
    assert.ok(schema.required.includes(field), `missing required field: ${field}`);
  }
  assert.equal(schema.additionalProperties, false);
});

test("accepts a complete quarantined resource with explicitly unknown license and cost", () => {
  assert.deepEqual(errorsFor(validEntry(), schema), []);
});

test("rejects missing provenance, malformed identifiers, invalid URLs, and unknown fields", () => {
  for (const entry of [
    validEntry({ license: undefined }),
    validEntry({ id: "Not Valid!" }),
    validEntry({ source_url: "javascript:alert(1)" }),
    validEntry({ surprise_permission: true })
  ]) assert.notDeepEqual(errorsFor(entry, schema), []);
});

test("rejects invalid enums, duplicate tags, and overlong metadata", () => {
  for (const entry of [
    validEntry({ trust_state: "trusted" }),
    validEntry({ cost_model: "free-ish" }),
    validEntry({ skill_tags: ["research", "research"] }),
    validEntry({ summary: "x".repeat(2001) })
  ]) assert.notDeepEqual(errorsFor(entry, schema), []);
});

test("approved resources require a reviewer, review timestamp, and evidence", () => {
  assert.notDeepEqual(errorsFor(validEntry({ trust_state: "approved" }), schema), []);
  const approved = validEntry({
    trust_state: "approved",
    reviewer: "owner",
    reviewed_at: "2026-11-13T00:00:00.000Z",
    review_evidence: ["Pinned revision inspected; permissions reviewed."]
  });
  assert.deepEqual(errorsFor(approved, schema), []);
});
