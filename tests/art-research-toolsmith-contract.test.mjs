import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const art = readFileSync(new URL("../agent/skills/art-research-policy-check.md", import.meta.url), "utf8");
const toolsmith = readFileSync(new URL("../agent/skills/toolsmith.md", import.meta.url), "utf8");
const plan = readFileSync(new URL("../docs/superpowers/plans/2026-11-19-eve-art-research-and-toolsmith.md", import.meta.url), "utf8");

test("art research skill remains proposal-only and blocks external actions", () => {
  for (const phrase of ["proposal for the owner", "never uploads or publishes artwork", "purchases", "contacts third parties", "Persistent memory is mandatory for scheduled runs"]) {
    assert.ok(art.includes(phrase), `Missing required art-skill guardrail: ${phrase}`);
  }
});

test("art research requires current official policy evidence and explicit uncertainty", () => {
  for (const phrase of ["current official terms", "date checked", "confirmed, conflicting, or unverified", "If official sources conflict", "never fill the gap from memory"]) {
    assert.ok(art.includes(phrase), `Missing evidence requirement: ${phrase}`);
  }
});

test("Toolsmith cannot grant itself authority or bypass owner controls", () => {
  for (const phrase of ["cannot grant itself", "approval gates", "No direct writes to protected/default branches", "exact commit SHA", "No arbitrary shell"]) {
    assert.ok(toolsmith.includes(phrase) || plan.includes(phrase), `Missing Toolsmith safety requirement: ${phrase}`);
  }
});

test("consolidated plan sequences memory and retrieval verification before scheduled research", () => {
  assert.match(plan, /Persistent memory must be verified before scheduled runs/);
  assert.match(plan, /Scheduled research[\s\S]*?only after repeated memory read\/write\/read-back and retrieval tests/);
});
