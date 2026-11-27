import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isExplicitReadOnlyTurn } from "../../agent/lib/tool-access.ts";

const prompt = await readFile(new URL("../../agent/prompts/owner-approved-manual-run.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../../apps/web/app/api/owner/run-now/route.ts", import.meta.url), "utf8");

test("manual owner run attempts the approved task claim before diagnostics or other tools", () => {
  assert.match(route, /OWNER_APPROVED_MANUAL_RUN_PROMPT/);
  for (const required of [
    "FIRST tool call must be task_claim_next, exactly once",
    "Do not call task_list, runtime_diagnostics, memory tools, or any other tool before attempting that claim",
    "If no task is returned, stop immediately",
  ]) assert.ok(prompt.includes(required), `missing manual prompt requirement: ${required}`);
  assert.ok(prompt.length < 2_300, `manual prompt too large: ${prompt.length}`);
});

test("manual claim instruction does not accidentally suppress stateful task tools", () => {
  assert.equal(isExplicitReadOnlyTurn(prompt), false);
});

test("manual owner run preserves task approval, scope, and bounded closeout requirements", () => {
  for (const required of [
    "owner_approved exactly true",
    "goal_id exactly ebay-inventory-audit-development",
    "scope_id exactly ebay_inventory_audit_development",
    "products/ebay-inventory-audit/",
    "mission_authorized is not true",
    "strictly within that task's approved_scope",
    "task_transition exactly once",
    "Process at most one task in this invocation",
  ]) assert.ok(prompt.includes(required), `missing manual scope requirement: ${required}`);
});

test("manual owner run cannot treat one completed step as completion of the full approved task", () => {
  for (const required of [
    "every material objective in both the task goal and approved_scope is demonstrably complete",
    "completing one bounded step, finding a lead, or merely attaching evidence does not establish completion",
    "task_transition automatically schedules the next bounded invocation after five seconds",
    "hold_without_schedule: true only when blocked on owner input or an external dependency",
    "If any substantive work tool failed, do not schedule a resume",
    "Never ask the owner to re-approve a task that is already individually owner-approved or authorized by the exact active goal registry",
    "Evidence references must identify concrete supporting records",
  ]) assert.ok(prompt.includes(required), `missing manual closeout requirement: ${required}`);
});

test("manual owner run preserves token and neuron efficiency safeguards", () => {
  for (const required of [
    "reusing recent verified evidence",
    "avoiding repeated diagnostics/searches",
    "unchanged retries",
    "provider quota and local neuron guards",
    "task_heartbeat",
  ]) assert.ok(prompt.includes(required), `missing efficiency safeguard: ${required}`);
});
