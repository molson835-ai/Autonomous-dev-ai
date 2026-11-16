import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN = /TASK_OWNER_APPROVAL_TOKEN|OWNER_SESSION_SIGNING_SECRET|\/decision|\/approve|\/owner-control|\/v1\/owner\//;

function files(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

test("agent code never calls owner-only memory or task routes and never references owner credentials", () => {
  const sourceFiles = files("agent").filter(path => /\.(ts|mjs)$/.test(path));
  for (const path of sourceFiles) {
    assert.ok(!FORBIDDEN.test(readFileSync(path, "utf8")), path + " references an owner-only capability");
  }
});

test("memory client uses only the agent memory credential and has no owner-token fallback", () => {
  const client = readFileSync("agent/lib/memory-client.ts", "utf8");
  assert.match(client, /env\.MEMORY_API_TOKEN/);
  assert.doesNotMatch(client, /TASK_OWNER_APPROVAL_TOKEN|OWNER_SESSION_SIGNING_SECRET|OWNER_GITHUB_ID/);
});
