import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const schedule = await readFile(new URL("../../agent/schedules/owner-approved-work-loop.ts", import.meta.url), "utf8");
const prompt = await readFile(new URL("../../agent/prompts/owner-approved-work-loop.ts", import.meta.url), "utf8");
const workLoop = `${schedule}\n${prompt}`;

test("scheduled work loop respects the Vercel Hobby daily cron limit", () => {
  assert.ok(schedule.includes('cron: "0 14 * * *"'));
});

test("scheduled work claims exactly one individually owner-approved task and checkpoints across fresh sessions", () => {
  assert.match(workLoop, /task_claim_next exactly once/);
  assert.match(workLoop, /task\.owner_approved === true/);
  assert.match(workLoop, /task\.mission_authorized !== true/);
  assert.match(workLoop, /Mission-authorized tasks, standing mandates/);
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


test("task claiming is owner-approved-only in both tool contract and Worker SQL", async () => {
  const tool = await readFile(new URL("../../agent/tools/task_claim_next.ts", import.meta.url), "utf8");
  const worker = await readFile(new URL("../../memory/worker/src/index.ts", import.meta.url), "utf8");
  const heartbeat = await readFile(new URL("../../agent/tools/task_heartbeat.ts", import.meta.url), "utf8");
  const taskList = await readFile(new URL("../../agent/tools/task_list.ts", import.meta.url), "utf8");
  assert.match(tool, /individually approved by the owner/);
  assert.doesNotMatch(tool, /standing EVE revenue mission mandate/);
  assert.match(tool, /external actions are draft-only/);
  assert.match(tool, /separate explicit owner approval/);
  assert.match(worker, /WHERE owner_approved=1 AND mission_authorized=0 AND attempt_count<max_attempts AND step_count<max_steps/);
  assert.doesNotMatch(worker, /owner_approved=1 OR mission_authorized=1/);
  assert.match(worker, /status='running' AND owner_approved=1 AND mission_authorized=0/);
  assert.match(heartbeat, /actively running and individually approved/);
  assert.doesNotMatch(taskList, /standing-mandate allowlist/);
});


test("all active mission and owner-console instructions agree on per-task and external-action approval", async () => {
  const instructions = await readFile(new URL("../../agent/instructions.md", import.meta.url), "utf8");
  const mission = await readFile(new URL("../../agent/skills/revenue-mission.md", import.meta.url), "utf8");
  const earnedGrowth = await readFile(new URL("../../agent/skills/earned-growth.md", import.meta.url), "utf8");
  const scheduleDocs = await readFile(new URL("../../docs/phase-4-scheduled-work-loop.md", import.meta.url), "utf8");
  const ownerConsole = await readFile(new URL("../../apps/web/app/owner/owner-console.tsx", import.meta.url), "utf8");
  const combined = [instructions, mission, earnedGrowth, scheduleDocs, ownerConsole].join("\n");

  assert.match(instructions, /every unit of work must be represented by a task individually approved/i);
  assert.match(mission, /every unit of work requires an individually owner-approved task/i);
  assert.match(earnedGrowth, /each unit of work requires explicit owner approval/i);
  assert.match(scheduleDocs, /individually owner-approved with.*mission_authorized=0/i);
  assert.match(ownerConsole, /Awaiting owner approval/);

  for (const staleDelegation of [
    /owner has delegated routine business execution/i,
    /owner has delegated these ordinary business actions to EVE/i,
    /without routine approval/i,
    /within EVE's standing mission mandate/i,
    /standing mission mandate auto-queues/i,
    /either individually owner-approved or mission-authorized/i,
    /may conduct relevant, honest, lawful, platform-compliant customer discovery and outreach/i,
  ]) {
    assert.doesNotMatch(combined, staleDelegation);
  }
  assert.doesNotMatch(ownerConsole, /standing-mission authorized|standing mission mandate/i);
});


test("waiting task transitions schedule five seconds by default unless explicitly held", async () => {
  const tool = await readFile(new URL("../../agent/tools/task_transition.ts", import.meta.url), "utf8");
  assert.match(tool, /hold_without_schedule: z\.boolean\(\)\.optional\(\)/);
  assert.match(tool, /body\.status === "waiting" \? 5_000 : null/);
  assert.match(tool, /hold_without_schedule === true \? null/);
  assert.match(tool, /A held waiting task cannot also have a resume delay/);
});
