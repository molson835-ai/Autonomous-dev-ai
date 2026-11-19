import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../apps/web/app/api/owner/memory-diagnostic/route.ts", import.meta.url), "utf8");
const worker = readFileSync(new URL("../memory/worker/src/index.ts", import.meta.url), "utf8");

test("owner memory diagnostic authenticates before running any probe and fails closed", () => {
  const auth = route.indexOf("await getVerifiedOwnerLogin()");
  const probe = route.indexOf("await runOwnerMemoryProbe(");
  assert.ok(auth >= 0 && probe > auth, "owner authentication must precede outbound probes");
  assert.match(route, /if \(!ownerLogin\)/);
  assert.match(route, /status: 401/);
  assert.match(route, /isSameOriginRequest/);
  assert.doesNotMatch(route, /MEMORY_API_TOKEN\s*:/);
});

test("Durable Object failures log only a random incident ID and sanitized request metadata", () => {
  assert.match(worker, /const incidentId = crypto\.randomUUID\(\)/);
  assert.match(worker, /route: url\.pathname/);
  assert.match(worker, /method: request\.method/);
  assert.match(worker, /exception_name: exceptionName/);
  assert.match(worker, /return withOwnerCors\(json\(\{ error: "Internal server error\.", incident_id: incidentId \}, 500\)\)/);
  const catchBlock = worker.slice(worker.lastIndexOf("const incidentId = crypto.randomUUID()"));
  assert.doesNotMatch(catchBlock, /request\.url|url\.search|error\.message/);
});
