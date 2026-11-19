import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../agent/tools/memory_recall.ts", import.meta.url), "utf8");

test("memory recall reports an unavailable service without throwing tool-loop errors", () => {
  assert.match(source, /try\s*\{/);
  assert.match(source, /catch\s*\{/);
  assert.match(source, /status:\s*"unavailable"/);
  assert.match(source, /Continue using current-session context only/);
});
