import test from "node:test";
import assert from "node:assert/strict";
import { validateCsvArtifact } from "../agent/lib/csv-artifact-policy.mjs";

const valid = "sku,expected,actual,variance\nA-1,10,8,-2\nA-2,4,4,0";

test("accepts consistent CSV and returns a UTF-8 downloadable artifact", () => {
  const result = validateCsvArtifact({ name: "Cycle Count", content: valid });
  assert.equal(result.valid, true);
  assert.equal(result.artifact.filename, "Cycle-Count.csv");
  assert.equal(result.artifact.mediaType, "text/csv; charset=utf-8");
  assert.match(result.artifact.content, /\r\n/);
  assert.equal(result.limits.spreadsheetFormulas, false);
});

test("rejects inconsistent columns, duplicate or empty headers", () => {
  for (const content of ["sku,count\nA-1", "sku,sku\nA-1,A-2", ",count\nA-1,2"]) {
    assert.equal(validateCsvArtifact({ name: "bad", content }).valid, false);
  }
});

test("handles quoted commas, quotes and line breaks", () => {
  assert.equal(validateCsvArtifact({ name: "quoted", content: 'name,note\nA,"one, two"\nB,"say ""hello"""' }).valid, true);
  assert.equal(validateCsvArtifact({ name: "multiline", content: 'name,note\nA,"line one\nline two"' }).valid, true);
});

test("rejects malformed quoting and formula-like cells", () => {
  for (const content of ['a,b\n1,"unfinished', "a,b\n1,2x\"3", "item,note\nA,=HYPERLINK(\"https://bad\")", 'item,note\nA," +SUM(1,2)"']) {
    assert.equal(validateCsvArtifact({ name: "bad", content }).valid, false);
  }
});

test("enforces name, size, row, column and control-character limits", () => {
  assert.equal(validateCsvArtifact({ name: "", content: valid }).valid, false);
  assert.equal(validateCsvArtifact({ name: "big", content: "a\n" + "x".repeat(64 * 1024) }).valid, false);
  assert.equal(validateCsvArtifact({ name: "rows", content: "a\n" + Array.from({length:500},(_,i)=>i).join("\n") }).valid, false);
  assert.equal(validateCsvArtifact({ name: "control", content: "a\nb\u0001" }).valid, false);
  assert.equal(validateCsvArtifact({ name: "bom", content: "\uFEFFa\nb" }).valid, false);
});
