import test from "node:test";
import assert from "node:assert/strict";
import { buildOwnerChannelCookieHeader } from "../apps/web/lib/owner-run-auth.mjs";

test("builds the Eve owner cookie header from a valid opaque token", () => {
  assert.equal(
    buildOwnerChannelCookieHeader("eve_agent_owner", "gho_0123456789abcdef"),
    "eve_agent_owner=gho_0123456789abcdef",
  );
});

test("rejects missing, oversized, or cookie-injection tokens", () => {
  assert.equal(buildOwnerChannelCookieHeader("eve_agent_owner", ""), null);
  assert.equal(buildOwnerChannelCookieHeader("eve_agent_owner", "x".repeat(4097)), null);
  assert.equal(buildOwnerChannelCookieHeader("eve_agent_owner", "valid; Path=/"), null);
  assert.equal(buildOwnerChannelCookieHeader("eve_agent_owner", "valid\r\nCookie: injected"), null);
  assert.equal(buildOwnerChannelCookieHeader("bad;name", "valid"), null);
});

test("does not manufacture an owner cookie for an absent session", () => {
  assert.equal(buildOwnerChannelCookieHeader("eve_agent_owner", undefined), null);
});
