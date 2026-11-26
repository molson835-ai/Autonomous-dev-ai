import test from "node:test";
import assert from "node:assert/strict";
import { listSkills, loadSkill } from "../agent/lib/skill-library.mjs";

test("skill catalog is compact and includes the seller workflow", () => {
  const catalog = listSkills();
  assert.ok(catalog.length >= 7);
  assert.ok(catalog.some((skill) => skill.id === "seller-operations"));
  assert.ok(catalog.every((skill) => skill.id && skill.description && skill.category));
  assert.ok(catalog.every((skill) => skill.capabilities.length > 0 && skill.benchmarkTasks.length > 0));
  assert.ok(catalog.some((skill) => skill.category === "software-engineering"));
});

test("loader returns one fixed, bundled skill without loading unrelated guides", async () => {
  const result = await loadSkill("seller-operations");
  assert.equal(result.status, "loaded");
  assert.equal(result.skill, "seller-operations");
  assert.match(result.content, /unit economics/i);
  assert.equal(result.truncated, false);
});

test("unknown identifiers and path traversal do not access files", async () => {
  const result = await loadSkill("../../README");
  assert.equal(result.status, "not_found");
  assert.ok(result.available.includes("seller-operations"));
});

test("skill output has a strict caller-selected character cap", async () => {
  const result = await loadSkill("resource-discovery", 500);
  assert.equal(result.status, "loaded");
  assert.equal(result.content.length, 500);
  assert.equal(result.truncated, true);
});

test("invalid output limits fail closed", async () => {
  assert.equal((await loadSkill("toolsmith", 9000)).status, "invalid_limit");
});

test("catalog filters by exact category and capability without loading skill files", () => {
  const category = listSkills({ category: "business-operations" });
  assert.ok(category.length >= 2);
  assert.ok(category.every((skill) => skill.category === "business-operations"));
  const capability = listSkills({ capability: "inventory-accuracy" });
  assert.deepEqual(capability.map((skill) => skill.id), ["seller-operations"]);
  assert.deepEqual(listSkills({ category: "not-a-category" }), []);
});

test("loaded skill includes the same structured learning metadata as the catalog", async () => {
  const result = await loadSkill("resource-discovery");
  assert.equal(result.status, "loaded");
  assert.equal(result.category, "research-and-knowledge");
  assert.ok(result.capabilities.includes("license-review"));
  assert.ok(result.benchmarkTasks.length > 0);
});
