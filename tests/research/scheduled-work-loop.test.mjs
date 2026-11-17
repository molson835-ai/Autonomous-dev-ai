import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const schedule = await readFile(new URL("../../agent/schedules/owner-approved-work-loop.ts", import.meta.url), "utf8");

test("scheduled work loop respects the Vercel Hobby daily cron limit", () => {
  assert.ok(schedule.includes('cron: "0 14 * * *"'));
});

test("scheduled work claims exactly one individually owner-approved task and checkpoints across fresh sessions", () => {
  assert.match(schedule, /task_claim_next exactly once/);
  assert.match(schedule, /task\.owner_approved === true/);
  assert.match(schedule, /task\.mission_authorized !== true/);
  assert.match(schedule, /Mission-authorized tasks, standing mandates/);
  assert.match(schedule, /fresh session/);
  assert.match(schedule, /checkpoint with waiting/);
  assert.match(schedule, /resume_after_minutes >= 1320/);
  assert.match(schedule, /Process one task only/);
  assert.match(schedule, /task_heartbeat at least every 10 minutes/);
});

test("scheduled work keeps outreach and publication draft-only while preserving financial boundaries", () => {
  assert.match(schedule, /no standing authority to contact anyone/);
  assert.match(schedule, /draft-only/);
  assert.match(schedule, /Never send, publish, submit, or claim that an external action occurred/);
  assert.match(schedule, /No personal funds, credit, cards, bank accounts, subscriptions/);
  assert.match(schedule, /Every expense requires separate explicit owner approval/);
  assert.match(schedule, /No Production deployment/);
  assert.match(schedule, /never retry through a paid provider/);
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
  assert.match(worker, /WHERE owner_approved=1 AND mission_authorized=0 AND attempt_count<max_attempts/);
  assert.doesNotMatch(worker, /owner_approved=1 OR mission_authorized=1/);
  assert.match(worker, /status='running' AND owner_approved=1 AND mission_authorized=0/);
  assert.match(heartbeat, /actively running and individually approved/);
  assert.doesNotMatch(taskList, /standing-mandate allowlist/);
});
