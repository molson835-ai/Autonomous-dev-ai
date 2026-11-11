import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const channel = readFileSync("agent/channels/eve.ts", "utf8");
const access = readFileSync("apps/web/app/_components/agent-access.tsx", "utf8");
const authModule = readFileSync("apps/web/app/agent-auth.ts", "utf8");
const chat = readFileSync("apps/web/app/_components/agent-chat.tsx", "utf8");
const layout = readFileSync("apps/web/app/layout.tsx", "utf8");

test("Eve session routes require configured owner credentials", () => {
  assert.match(channel, /httpBasic\(\{ username, password \}/);
  assert.match(channel, /ROUTE_AUTH_BASIC_USER/);
  assert.match(channel, /ROUTE_AUTH_BASIC_PASSWORD/);
  assert.match(channel, /: async \(\) => null/);
  assert.match(channel, /auth: \[ownerAuth, localDev\(\)\]/);
  assert.doesNotMatch(channel, /\bnone\s*\(/);
});

test("browser sign-in verifies credentials before showing the chat", () => {
  assert.match(access, /fetch\("\/eve\/v1\/info"/);
  assert.match(access, /setAgentCredentials\(\{ username, password \}\)/);
  assert.match(access, /That username or password was not accepted/);
  assert.match(layout, /<AgentAccess>\{children\}<\/AgentAccess>/);
});

test("Eve requests receive Basic auth without persisting credentials", () => {
  assert.match(authModule, /let credentials:/);
  assert.match(authModule, /TextEncoder/);
  assert.match(authModule, /authorization:/);
  assert.doesNotMatch(authModule, /localStorage|sessionStorage|document\.cookie/);
  assert.match(chat, /headers: getAgentAuthHeaders/);
});
