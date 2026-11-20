import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

test("pull request verification is not limited to a stale branch allowlist", () => {
  const pullRequest = workflow.match(/^  pull_request:\s*\n([\s\S]*?)(?=^  push:|^permissions:)/m);
  assert.ok(pullRequest, "CI must define a pull_request trigger");
  assert.doesNotMatch(pullRequest[1], /^    branches:/m);
});
