import test from "node:test";
import assert from "node:assert/strict";
import { runDataWorkbench } from "../agent/lib/data-workbench.mjs";

const records = [
  { sku: "A", category: "book", price: 10, active: true },
  { sku: "B", category: "book", price: 15, active: true },
  { sku: "C", category: "game", price: 25, active: false },
  { sku: "C", category: "game", price: 25, active: false }
];

test("summarizes record counts, missing values, and numeric ranges", () => {
  const result = runDataWorkbench({ operation: "summarize", records });
  assert.equal(result.status, "ok");
  assert.equal(result.recordCount, 4);
  const price = result.fields.find((field) => field.field === "price");
  assert.equal(price.numeric.min, 10);
  assert.equal(price.numeric.max, 25);
  assert.equal(price.numeric.mean, 18.75);
});

test("deduplicates by all fields or selected keys", () => {
  const all = runDataWorkbench({ operation: "deduplicate", records });
  assert.equal(all.rowCount, 3);
  assert.equal(all.removedCount, 1);
  const byCategory = runDataWorkbench({ operation: "deduplicate", records, fields: ["category"] });
  assert.equal(byCategory.rowCount, 2);
});

test("projects fields and caps returned rows", () => {
  const result = runDataWorkbench({ operation: "project", records, fields: ["sku", "price"], max_output: 2 });
  assert.equal(result.rowCount, 4);
  assert.equal(result.returnedCount, 2);
  assert.equal(result.truncated, true);
  assert.deepEqual(result.records[0], { sku: "A", price: 10 });
});

test("sorts numeric values and filters by typed comparisons", () => {
  const sorted = runDataWorkbench({ operation: "sort", records, field: "price", direction: "desc" });
  assert.equal(sorted.records[0].price, 25);
  const filtered = runDataWorkbench({ operation: "filter", records, field: "price", operator: "gte", value: 15 });
  assert.equal(filtered.rowCount, 3);
});

test("groups values with counts and preserves null/missing as one group", () => {
  const result = runDataWorkbench({ operation: "group_count", records, field: "category" });
  assert.deepEqual(result.groups, [{ value: "book", count: 2 }, { value: "game", count: 2 }]);
});

test("rejects malformed data, unsafe fields, and unsupported operations", () => {
  assert.equal(runDataWorkbench({ operation: "summarize", records: [null] }).status, "invalid_input");
  assert.equal(runDataWorkbench({ operation: "summarize", records: [{ constructor: "bad" }] }).status, "invalid_input");
  assert.equal(runDataWorkbench({ operation: "shell", records: [] }).status, "invalid_input");
  assert.equal(runDataWorkbench({ operation: "filter", records, field: "price", operator: "gt", value: "12" }).records.length, 0);
});

test("enforces output and total input bounds", () => {
  assert.equal(runDataWorkbench({ operation: "summarize", records, max_output: 101 }).status, "invalid_input");
  const oversized = [{ payload: "x".repeat(2000) }, ...Array(150).fill({ payload: "x".repeat(2000) })];
  assert.equal(runDataWorkbench({ operation: "summarize", records: oversized }).status, "input_too_large");
  assert.equal(runDataWorkbench({ operation: "summarize", records: Array(501).fill({}) }).status, "invalid_input");
});
