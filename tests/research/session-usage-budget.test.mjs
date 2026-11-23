import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const agent = await readFile(new URL("../../agent/agent.ts", import.meta.url), "utf8");

test("session usage budget allows the observed startup prompt and bounds the work loop", () => {
  assert.match(agent, /const MAX_SESSION_INPUT_TOKENS = 400_000/);
  assert.match(agent, /const MAX_SESSION_OUTPUT_TOKENS = 4_000/);
  assert.match(agent, /window\.inputTokens - window\\.cacheReadTokens >= MAX_SESSION_INPUT_TOKENS/);
  assert.match(agent, /window\.outputTokens >= MAX_SESSION_OUTPUT_TOKENS/);
  assert.match(agent, /71,883 uncached input tokens/);
  assert.match(agent, /131,072 tokens/);
});
