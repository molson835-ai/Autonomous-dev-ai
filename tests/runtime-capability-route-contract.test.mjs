import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../apps/web/app/api/owner/runtime-capabilities/route.ts", import.meta.url), "utf8");

test("runtime capability inspection is owner-authenticated and production-only", () => {
  assert.match(route, /getVerifiedOwnerLogin\(\)/);
  assert.match(route, /owner_authentication_required/);
  assert.match(route, /VERCEL_ENV !== "production"/);
  assert.match(route, /production_environment_required/);
});

test("runtime capability inspection uses the documented Eve info client with Vercel OIDC", () => {
  assert.match(route, /new Client\(/);
  assert.match(route, /client\.info\(/);
  assert.match(route, /getVercelOidcToken\(\)/);
  assert.match(route, /VERCEL_URL/);
});

test("runtime capability inspection is read-only, bounded, and does not expose upstream errors", () => {
  assert.match(route, /AbortSignal\.timeout\(8_000\)/);
  assert.match(route, /cache-control/);
  assert.match(route, /projectRuntimeCapabilities\(info/);
  assert.match(route, /catch \{/);
  assert.match(route, /agent_info_unavailable/);
  assert.doesNotMatch(route, /error\.message|error\.stack|response\.text\(\)/);
});
