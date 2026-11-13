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
  assert.match(schedule, /task_transition\(status="waiting"\)/);
  assert.match(schedule, /resume_after_minutes of at least 1440/);
  assert.match(schedule, /Process one task only/);
});

test("scheduled work cannot approve itself or cross external-action boundaries", () => {
  assert.match(schedule, /Never approve, resume, cancel, or expand a task yourself/);
  assert.match(schedule, /no paid service/);
  assert.match(schedule, /purchase/);
  assert.match(schedule, /no customer contact/);
  assert.match(schedule, /no Production deployment/);
  assert.match(schedule, /no secret or owner token may be exposed/);
});
