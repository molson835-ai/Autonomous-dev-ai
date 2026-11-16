import test from "node:test";
import assert from "node:assert/strict";
import { isSafeMemoryText, normalizeMemoryQuery } from "../agent/lib/memory-policy.mjs";

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


test("rejects the application's own environment variable names and common token formats", () => {
  assert.equal(isSafeMemoryText("CLOUDFLARE_API_TOKEN=cf_api_token_value_123456"), false);
  assert.equal(isSafeMemoryText("MEMORY_API_TOKEN=memory_api_token_value_123456"), false);
  assert.equal(isSafeMemoryText('"api_token": "json_api_token_value_123456"'), false);
  assert.equal(isSafeMemoryText("github_pat_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890"), false);
  assert.equal(isSafeMemoryText("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890"), false);
  assert.equal(isSafeMemoryText("AKIA1234567890ABCDEF"), false);
});
