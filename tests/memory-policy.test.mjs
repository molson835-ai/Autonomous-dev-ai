import test from "node:test";
import assert from "node:assert/strict";
import { isSafeMemoryText, normalizeMemoryQuery } from "../agent/memory/policy.mjs";

test("accepts ordinary task experience and learning notes", () => {
  assert.equal(isSafeMemoryText("Fixed the route handler and verified the integration test."), true);
});

test("rejects empty, oversized, and credential-like content", () => {
  assert.equal(isSafeMemoryText("   "), false);
  assert.equal(isSafeMemoryText("x".repeat(6001)), false);
  assert.equal(isSafeMemoryText("API_KEY=abc1234567890"), false);
  assert.equal(isSafeMemoryText("Bearer abcdefghijklmnopqrstuvwxyz123456"), false);
  assert.equal(isSafeMemoryText("-----BEGIN PRIVATE KEY-----\\nsecret"), false);
});

test("normalizes recall queries without changing non-string input", () => {
  assert.equal(normalizeMemoryQuery("  calculator learning  "), "calculator learning");
  assert.equal(normalizeMemoryQuery(123), "");
  assert.equal(normalizeMemoryQuery("x".repeat(400)).length, 300);
});
