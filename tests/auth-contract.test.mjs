import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const channel = readFileSync("agent/channels/eve.ts", "utf8");
const chat = readFileSync("apps/web/app/_components/agent-chat.tsx", "utf8");
const layout = readFileSync("apps/web/app/layout.tsx", "utf8");

test("Eve chat channel accepts anonymous requests", () => {
  assert.match(channel, /import\s*\{[^}]*\bnone\b[^}]*\}\s*from\s*["']eve\/channels\/auth["']/);
  assert.match(channel, /auth:\s*\[[^\]]*none\(\)[^\]]*\]/);
  assert.doesNotMatch(channel, /verifyHttpBasic|ROUTE_AUTH_BASIC_USER|ROUTE_AUTH_BASIC_PASSWORD/);
});

test("Browser UI has no username/password gate or Basic auth header", () => {
  assert.doesNotMatch(layout, /AgentAccess/);
  assert.doesNotMatch(chat, /getAgentAuthHeaders|authorization/i);
  assert.doesNotMatch(chat, /agent-auth/);
});
