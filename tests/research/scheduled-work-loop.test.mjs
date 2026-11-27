import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const schedule = await readFile(new URL("../../agent/schedules/owner-approved-work-loop.ts", import.meta.url), "utf8");
const prompt = await readFile(new URL("../../agent/prompts/owner-approved-work-loop.ts", import.meta.url), "utf8");
const workLoop = `${schedule}\n${prompt}`;

test("scheduled work loop respects the Vercel Hobby daily cron limit", () => {
  assert.ok(schedule.includes('cron: "0 14 * * *"'));
});

test("scheduled work claims one individually approved or exact goal-authorized task", () => {
  assert.match(workLoop, /task_claim_next exactly once/);
  assert.match(workLoop, /task\.owner_approved === true/);
  assert.match(workLoop, /task\.goal_id === "ebay-inventory-audit-development"/);
  assert.match(workLoop, /task\.scope_id === "ebay_inventory_audit_development"/);
  assert.match(workLoop, /products\/ebay-inventory-audit\//);
  assert.match(workLoop, /task\.mission_authorized !== true/);
  assert.match(workLoop, /fresh session/);
  assert.match(workLoop, /checkpoint with waiting/);
  assert.match(workLoop, /task_transition now schedules the next invocation after five seconds by default/);
  assert.match(workLoop, /hold_without_schedule: true only when blocked on owner input or an external dependency/);
  assert.match(workLoop, /Process one task only/);
  assert.match(workLoop, /task_heartbeat at least every 10 minutes/);
});

test("scheduled work keeps outreach and publication draft-only while preserving financial boundaries", () => {
  assert.match(workLoop, /no standing authority to contact anyone/);
  assert.match(workLoop, /draft-only/);
  assert.match(workLoop, /Never send, publish, submit, or claim that an external action occurred/);
  assert.match(workLoop, /No personal funds, credit, cards, bank accounts, subscriptions/);
  assert.match(workLoop, /Every expense requires separate explicit owner approval/);
  assert.match(workLoop, /No Production deployment/);
  assert.match(workLoop, /never retry through a paid provider/);
});

test("task claiming is restricted to individual approval or the exact approved goal", async () => {
  const tool = await readFile(new URL("../../agent/tools/task_claim_next.ts", import.meta.url), "utf8");
  const worker = await readFile(new URL("../../memory/worker/src/index.ts", import.meta.url), "utf8");
  const heartbeat = await readFile(new URL("../../agent/tools/task_heartbeat.ts", import.meta.url), "utf8");
  const taskList = await readFile(new URL("../../agent/tools/task_list.ts", import.meta.url), "utf8");
  assert.match(tool, /server-enforced approved goal/);
  assert.match(tool, /ebay-inventory-audit-development/);
  assert.match(tool, /external actions are draft-only/);
  assert.match(tool, /separate explicit owner approval/);
  assert.match(worker, /goal_id='ebay-inventory-audit-development' AND scope_id='ebay_inventory_audit_development'/);
  assert.match(worker, /owner_approved=1 OR \(t\.goal_id='ebay-inventory-audit-development'/);
  assert.doesNotMatch(worker, /owner_approved=1 OR mission_authorized=1/);
  assert.match(worker, /status='running' AND mission_authorized=0 AND \(owner_approved=1 OR/);
  assert.match(heartbeat, /active goal registry/);
  assert.match(taskList, /active owner-approved goal registry/);
});

test("active instructions separate approved-goal autonomy from the broader revenue mission", async () => {
  const instructions = await readFile(new URL("../../agent/instructions.md", import.meta.url), "utf8");
  const mission = await readFile(new URL("../../agent/skills/revenue-mission.md", import.meta.url), "utf8");
  const earnedGrowth = await readFile(new URL("../../agent/skills/earned-growth.md", import.meta.url), "utf8");
  const scheduleDocs = await readFile(new URL("../../docs/phase-4-scheduled-work-loop.md", import.meta.url), "utf8");
  const ownerConsole = await readFile(new URL("../../apps/web/app/owner/owner-console.tsx", import.meta.url), "utf8");
  const combined = [instructions, mission, earnedGrowth, scheduleDocs, ownerConsole].join("\n");
  assert.match(instructions, /only eBay inventory-audit development under products\/ebay-inventory-audit\//i);
  assert.match(mission, /only eBay inventory-audit development under products\/ebay-inventory-audit\//i);
  assert.match(earnedGrowth, /each unit of work requires explicit owner approval/i);
  assert.match(scheduleDocs, /ebay-inventory-audit-development.*products\/ebay-inventory-audit\//i);
  assert.match(ownerConsole, /Approved goal: eBay inventory-audit development/);
  assert.match(ownerConsole, /Awaiting owner approval/);
  for (const staleDelegation of [
    /owner has delegated routine business execution/i,
    /owner has delegated these ordinary business actions to EVE/i,
    /without routine approval/i,
    /within EVE's standing mission mandate/i,
    /standing mission mandate auto-queues/i,
    /either individually owner-approved or mission-authorized/i,
    /may conduct relevant, honest, lawful, platform-compliant customer discovery and outreach/i,
  ]) assert.doesNotMatch(combined, staleDelegation);
  assert.doesNotMatch(ownerConsole, /standing-mission authorized|standing mission mandate/i);
});

test("waiting task transitions schedule five seconds by default unless explicitly held", async () => {
  const tool = await readFile(new URL("../../agent/tools/task_transition.ts", import.meta.url), "utf8");
  assert.match(tool, /hold_without_schedule: z\.boolean\(\)\.optional\(\)/);
  assert.match(tool, /body\.status === "waiting" \? 5_000 : null/);
  assert.match(tool, /hold_without_schedule === true \? null/);
  assert.match(tool, /Scheduling controls have meaning only for waiting tasks/);
  assert.match(tool, /if \(body\.status === "waiting" && resume_after_seconds !== undefined && resume_after_minutes !== undefined\)/);
  assert.doesNotMatch(tool, /Resume scheduling controls are only valid when status is waiting/);
  assert.match(tool, /A held waiting task cannot also have a resume delay/);
});
