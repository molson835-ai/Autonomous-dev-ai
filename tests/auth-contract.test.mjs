import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const channel = readFileSync("agent/channels/eve.ts", "utf8");
const chat = readFileSync("apps/web/app/_components/agent-chat.tsx", "utf8");
const layout = readFileSync("apps/web/app/layout.tsx", "utf8");

test("Preview Eve accepts anonymous requests explicitly", () => {
  assert.match(channel, /env\.VERCEL_ENV\s*===\s*["']preview["']/);
  assert.match(channel, /auth:\s*isPreview\s*\?\s*\[none\(\)\]/);
  assert.match(channel, /import\s*\{[^}]*\bnone\b[^}]*\}\s*from\s*["']eve\/channels\/auth["']/);
});

test("Production Eve retains owner Basic auth and local development access", () => {
  assert.match(channel, /verifyHttpBasic\(/);
  assert.match(channel, /ROUTE_AUTH_BASIC_USER/);
  assert.match(channel, /ROUTE_AUTH_BASIC_PASSWORD/);
  assert.match(channel, /auth:\s*isPreview\s*\?\s*\[none\(\)\]\s*:\s*\[ownerAuth,\s*localDev\(\)\]/);
});

test("Browser UI has no username/password gate or Basic auth header", () => {
  assert.doesNotMatch(layout, /AgentAccess/);
  assert.doesNotMatch(chat, /getAgentAuthHeaders|authorization/i);
  assert.doesNotMatch(chat, /agent-auth/);
});
