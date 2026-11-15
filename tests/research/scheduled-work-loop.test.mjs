import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const schedule = await readFile(new URL("../../agent/schedules/owner-approved-work-loop.ts", import.meta.url), "utf8");

test("scheduled work loop respects the Vercel Hobby daily cron limit", () => {
  assert.ok(schedule.includes('cron: "0 14 * * *"'));
});

test("scheduled work claims at most one owner-approved task and checkpoints across fresh sessions", () => {
  assert.match(schedule, /task_claim_next exactly once/);
  assert.match(schedule, /already approved by the owner/);
  assert.match(schedule, /fresh session/);
  assert.match(schedule, /task_transition/);
  assert.match(schedule, /resume_after_minutes >= 1320/);
  assert.match(schedule, /Process one task only/);
});

test("scheduled work delegates lawful outreach while preserving financial boundaries", () => {
  assert.match(schedule, /may conduct relevant, truthful, lawful, privacy-respecting, platform-compliant customer discovery and outreach/);
  assert.match(schedule, /publish accurate offers/);
  assert.match(schedule, /No personal funds, credit, cards, bank accounts, subscriptions/);
  assert.match(schedule, /Every expense requires a separate explicit owner approval/);
  assert.match(schedule, /No Production deployment/);
  assert.match(schedule, /never retry through a paid provider/);
});
