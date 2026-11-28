import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

const [instructions, taskTool, worker, chat, authStart, authCallback] = await Promise.all([
  read("../agent/instructions.md"),
  read("../agent/tools/task_propose.ts"),
  read("../memory/worker/src/index.ts"),
  read("../apps/web/app/_components/agent-chat.tsx"),
  read("../apps/web/app/api/auth/github/route.ts"),
  read("../apps/web/app/api/auth/github/callback/route.ts"),
]);

test("verified owner can start approved-goal work directly from Eve chat", () => {
  for (const required of [
    "Direct owner-chat task launch",
    "Do not send the owner to the Owner Console",
    "First call `task_list`",
    "call `task_propose`",
    "`goal_id: ebay-inventory-audit-development`",
    "`owner_approved=false`",
    "`mission_authorized=false`",
    "let the Durable Object wake-up own claiming and execution",
    "Report that the task was queued, not that work has started",
  ]) assert.ok(instructions.includes(required), `missing direct-chat rule: ${required}`);
  assert.match(taskTool, /verified owner requests work inside the exact active goal/);
  assert.match(taskTool, /schedules its Durable Object wake-up/);
  assert.match(taskTool, /canUseWriteTools\(ctx\)/);
});

test("Worker queues only exact server-approved goal tasks and schedules durable wake-up", () => {
  assert.match(worker, /getApprovedGoal\(goalId\)/);
  assert.match(worker, /isApprovedGoalTaskInput\(taskInput\)/);
  assert.match(worker, /createTaskRecord\(\{ id: crypto\.randomUUID\(\), \.\.\.taskInput \}, \{ now, missionAuthorized: false \}\)/);
  assert.match(worker, /await this\.scheduleTaskWakeup\(\)/);
});

test("Eve chat exposes owner sign-in without routing task submission through Owner Hub", () => {
  assert.match(chat, /href="\/api\/auth\/github\?return_to=%2F"/);
  assert.match(chat, /Talk directly with Eve/);
  assert.match(chat, /<ChatHeader canStartNewChat=\{activeSessionId !== undefined\} \/>/);
  assert.doesNotMatch(chat, /href="\/owner"/);
});

test("OAuth return target is restricted to Eve chat or the Owner Console", () => {
  assert.match(authStart, /searchParams\.get\("return_to"\) === "\/" \? "\/" : "\/owner"/);
  assert.match(authStart, /OWNER_OAUTH_RETURN_COOKIE/);
  assert.match(authCallback, /request\.cookies\.get\(OWNER_OAUTH_RETURN_COOKIE\)/);
  assert.match(authCallback, /isConfiguredOwnerId\(user\.id\)/);
  assert.match(authCallback, /new URL\(returnTo, request\.url\)/);
  assert.doesNotMatch(authCallback, /searchParams\.get\("return_to"\)/);
});
