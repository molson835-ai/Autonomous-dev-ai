import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const names = [
  "earned-growth",
  "planning-output",
  "resource-discovery",
  "revenue-mission",
  "software-delivery",
  "toolsmith",
  "seller-operations"
];

test("production-root skill assets mirror the source skill library", async () => {
  for (const name of names) {
    const source = await readFile(new URL(`../agent/skills/${name}.md`, import.meta.url), "utf8");
    const packaged = await readFile(new URL(`../skills/${name}.md`, import.meta.url), "utf8");
    assert.equal(packaged, source, `${name} production skill asset must match its source`);
  }
});
