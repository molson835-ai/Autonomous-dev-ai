import test from "node:test";
import assert from "node:assert/strict";
import { createIsolatedExecutionPolicy, validateIsolatedExecutionRequest } from "../agent/lib/isolated-execution-policy.mjs";

test("sandbox policy is ephemeral, one-vCPU, and denies all egress", () => {
  const policy = createIsolatedExecutionPolicy();
  assert.equal(policy.persistent, false);
  assert.deepEqual(policy.resources, { vcpus: 1 });
  assert.equal(policy.networkPolicy, "deny-all");
  assert.deepEqual(policy.ports, []);
  assert.deepEqual(policy.env, {});
  assert.equal(policy.limits.credentials, false);
  assert.equal(policy.limits.packageInstallation, false);
  assert.equal(policy.limits.sudo, false);
  assert.equal(policy.limits.automaticToolRegistration, false);
  assert.equal(policy.limits.automaticExecutionOfGeneratedTools, false);
});

test("accepts only the bounded pure JavaScript test profile", () => {
  const result = validateIsolatedExecutionRequest({ profile: "node-test-pure-js", inputBytes: 1024 });
  assert.equal(result.valid, true);
  assert.equal(result.status, "validated_not_executed");
  assert.equal(result.timeoutMs, 30000);
  assert.equal(result.policy.timeout, 30000);
});

test("applies a validated custom timeout to the returned sandbox policy", () => {
  const result = validateIsolatedExecutionRequest({
    profile: "node-test-pure-js",
    inputBytes: 1024,
    timeoutMs: 45_000,
  });
  assert.equal(result.valid, true);
  assert.equal(result.timeoutMs, 45_000);
  assert.equal(result.policy.timeout, 45_000);
});

test("rejects arbitrary commands, shell requests, and network permissions", () => {
  assert.equal(validateIsolatedExecutionRequest({ profile: "bash", inputBytes: 1 }).valid, false);
  assert.equal(validateIsolatedExecutionRequest({ profile: "node-test-pure-js", inputBytes: 1, command: "bash" }).valid, false);
  assert.equal(validateIsolatedExecutionRequest({ profile: "node-test-pure-js", inputBytes: 1, network: true }).valid, false);
});

test("rejects missing, oversized, malformed, and over-time requests", () => {
  assert.equal(validateIsolatedExecutionRequest(null).valid, false);
  assert.equal(validateIsolatedExecutionRequest({ profile: "node-test-pure-js", inputBytes: 0 }).valid, false);
  assert.equal(validateIsolatedExecutionRequest({ profile: "node-test-pure-js", inputBytes: 81921 }).valid, false);
  assert.equal(validateIsolatedExecutionRequest({ profile: "node-test-pure-js", inputBytes: 1, timeoutMs: 60001 }).valid, false);
  assert.equal(validateIsolatedExecutionRequest({ profile: "node-test-pure-js", inputBytes: 1, timeoutMs: 0 }).valid, false);
  assert.throws(() => createIsolatedExecutionPolicy(60_001), RangeError);
});
