import test from "node:test";
import assert from "node:assert/strict";
import { runOwnerMemoryProbe } from "../apps/web/lib/owner-memory-probe.mjs";
const baseUrl = "https://autonomous-dev-memory.molson835.workers.dev";
const secretToken = "do-not-expose-this-token";
const queryMarker = "external_id=test";
const memoryMarker = "PRIVATE_MEMORY_CONTENT_SENTINEL";
test("performs exactly the two fixed GET probes and returns only safe metadata", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify({ memory: memoryMarker, token: secretToken }), { status: calls.length === 1 ? 200 : 404, headers: { "cf-ray": "abc123-IAD" } }); };
  const result = await runOwnerMemoryProbe({ baseUrl, token: secretToken, fetchImpl });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((call) => call.init.method), ["GET", "GET"]);
  assert.ok(calls.some((call) => call.url === baseUrl + "/v1/recall?limit=1"));
  assert.ok(calls.some((call) => call.url === baseUrl + "/v1/experiences?external_id=test"));
  assert.deepEqual(Object.keys(result).sort(), ["checks", "host_matches_expected"]);
  assert.equal(result.host_matches_expected, true);
  assert.deepEqual(result.checks.map((check) => check.status).sort(), [200, 404]);
  for (const check of result.checks) assert.deepEqual(Object.keys(check).sort(), ["cf_ray", "elapsed_ms", "error_code", "name", "status"]);
  const output = JSON.stringify(result);
  for (const forbidden of [secretToken, queryMarker, memoryMarker, "limit=1", baseUrl]) assert.equal(output.includes(forbidden), false);
});
test("fails closed on missing credentials without making requests", async () => {
  let calls = 0;
  const result = await runOwnerMemoryProbe({ baseUrl, token: "", fetchImpl: async () => { calls++; return new Response(null); } });
  assert.equal(calls, 0); assert.equal(result.host_matches_expected, false);
  assert.ok(result.checks.every((check) => check.error_code === "configuration_missing"));
});
test("rejects unexpected Worker hosts before any outbound request", async () => {
  let calls = 0;
  const result = await runOwnerMemoryProbe({ baseUrl: "https://attacker.example/path?secret=query", token: secretToken, fetchImpl: async () => { calls++; return new Response(null); } });
  assert.equal(calls, 0); assert.equal(result.host_matches_expected, false);
  assert.ok(result.checks.every((check) => check.error_code === "worker_host_mismatch"));
  const output = JSON.stringify(result); assert.equal(output.includes(secretToken), false); assert.equal(output.includes("secret=query"), false);
});
test("network failures expose only a bounded safe error code", async () => {
  const result = await runOwnerMemoryProbe({ baseUrl, token: secretToken, fetchImpl: async () => { throw new Error("upstream failed with " + secretToken + " " + memoryMarker); } });
  assert.ok(result.checks.every((check) => check.error_code === "upstream_network_error"));
  const output = JSON.stringify(result); assert.equal(output.includes(secretToken), false); assert.equal(output.includes(memoryMarker), false);
});
