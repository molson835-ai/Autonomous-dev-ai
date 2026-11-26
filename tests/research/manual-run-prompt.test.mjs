import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isExplicitReadOnlyTurn } from "../../agent/lib/tool-access.ts";

const prompt = await readFile(new URL("../../agent/prompts/owner-approved-manual-run.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../../apps/web/app/api/owner/run-now/route.ts", import.meta.url), "utf8");

test("manual owner run attempts the approved task claim before diagnostics or other tools", () => {
  assert.match(route, /OWNER_APPROVED_MANUAL_RUN_PROMPT/);
  assert.match(prompt, /FIRST tool call must be task_claim_next, exactly once/);
  assert.match(prompt, /Do not call task_list, runtime_diagnostics, memory tools, or any other tool before attempting that claim/);
  assert.match(prompt, /If no task is returned, stop immediately/);
});

test("manual claim instruction does not accidentally suppress stateful task tools", () => {
  assert.equal(isExplicitReadOnlyTurn(prompt), false);
});

test("manual owner run preserves task approval, scope, and bounded closeout requirements", () => {
  assert.match(prompt, /owner_approved is exactly true/);
  assert.match(prompt, /mission_authorized is not true/);
  assert.match(prompt, /strictly within that task's approved_scope/);
  assert.match(prompt, /task_transition exactly once/);
  assert.match(prompt, /Process at most one task in this invocation/);
});
