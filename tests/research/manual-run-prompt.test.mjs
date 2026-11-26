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

test("manual owner run cannot treat one completed step as completion of the full approved task", () => {
  assert.match(prompt, /every material objective in both the task goal and approved_scope is demonstrably complete/);
  assert.match(prompt, /completing one bounded step, finding a lead, or merely attaching evidence does not establish completion/);
  assert.match(prompt, /use waiting with resume_after_minutes: 1320/);
  assert.match(prompt, /Use waiting without a resume time only when blocked on owner input or an external dependency/);
  assert.match(prompt, /Never ask the owner to re-approve a task that is already individually owner-approved/);
  assert.match(prompt, /Evidence references must identify concrete supporting records/);
});

test("manual owner run preserves token and neuron efficiency safeguards", () => {
  assert.match(prompt, /reuse recent verified evidence/);
  assert.match(prompt, /avoid repeating diagnostics\/searches/);
  assert.match(prompt, /do not make unchanged retries/);
  assert.match(prompt, /Respect provider quota and local neuron guards/);
});
