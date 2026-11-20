import test from "node:test";
import assert from "node:assert/strict";
import { generateToolScaffold, validateToolProposal } from "../agent/lib/toolsmith.mjs";

const valid = {
  name: "sum-estimate",
  description: "Calculate a bounded estimate from supplied values.",
  purpose: "Return a deterministic arithmetic estimate without external effects.",
  capability: "pure",
  fields: [
    { name: "quantity", type: "number", min: 0, max: 10000, required: true },
    { name: "unitPrice", type: "number", min: 0, max: 100000, required: true },
    { name: "note", type: "string", maxLength: 120, required: false },
    { name: "includeTax", type: "boolean", required: true },
  ],
};

test("valid declarative proposal generates an inert typed tool scaffold", () => {
  const result = generateToolScaffold(valid);
  assert.equal(result.generated, true);
  assert.match(result.source, /defineTool/);
  assert.match(result.source, /z\.number\(\)\.min\(0\)\.max\(10000\)/);
  assert.match(result.source, /z\.string\(\)\.max\(120\)\.optional\(\)/);
  assert.match(result.source, /status: "not_implemented"/);
  assert.equal(result.limits.network, false);
  assert.equal(result.limits.filesystem, false);
  assert.equal(result.limits.automaticRegistration, false);
  assert.equal(result.limits.automaticExecution, false);
});

test("malicious text is escaped as a string literal, never executable source", () => {
  const proposal = { ...valid, description: '"; process.env.SECRET; //', purpose: "safe purpose" };
  const result = generateToolScaffold(proposal);
  assert.equal(result.generated, true);
  assert.ok(result.source.includes(JSON.stringify('PROPOSAL ONLY — "; process.env.SECRET; // Implement and review before enabling. safe purpose')));
  assert.equal(result.source.includes('description: ""; process.env.SECRET'), false);
});

test("rejects non-pure capabilities and arbitrary properties", () => {
  assert.equal(validateToolProposal({ ...valid, capability: "network" }).valid, false);
  assert.equal(validateToolProposal({ ...valid, shell: true }).valid, false);
  assert.equal(validateToolProposal({ ...valid, code: "process.exit(1)" }).valid, false);
});

test("rejects traversal-like names, unsafe field identifiers, and duplicates", () => {
  assert.equal(validateToolProposal({ ...valid, name: "../escape" }).valid, false);
  assert.equal(validateToolProposal({ ...valid, fields: [{ name: "__proto__", type: "string", maxLength: 20 }] }).valid, false);
  assert.equal(validateToolProposal({ ...valid, fields: [valid.fields[0], valid.fields[0]] }).valid, false);
});

test("rejects unbounded, oversized, malformed, and unknown field definitions", () => {
  assert.equal(validateToolProposal({ ...valid, fields: [] }).valid, false);
  assert.equal(validateToolProposal({ ...valid, fields: Array(9).fill(valid.fields[0]) }).valid, false);
  assert.equal(validateToolProposal({ ...valid, fields: [{ name: "value", type: "string", maxLength: 2001 }] }).valid, false);
  assert.equal(validateToolProposal({ ...valid, fields: [{ name: "value", type: "number", min: 5, max: 5 }] }).valid, false);
  assert.equal(validateToolProposal({ ...valid, fields: [{ name: "value", type: "string", maxLength: 20, defaultValue: "x" }] }).valid, false);
});

test("requires a bounded input schema and valid descriptions", () => {
  assert.equal(validateToolProposal({ ...valid, description: "" }).valid, false);
  assert.equal(validateToolProposal({ ...valid, purpose: "x".repeat(501) }).valid, false);
  assert.equal(validateToolProposal({ ...valid, fields: [{ name: "value", type: "boolean" }] }).valid, true);
});
