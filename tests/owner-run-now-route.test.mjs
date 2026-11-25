import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildOwnerChannelCookieHeader } from "../apps/web/lib/owner-run-auth.mjs";

const route = readFileSync(new URL("../apps/web/app/api/owner/run-now/route.ts", import.meta.url), "utf8");

test("manual run forwards the verified owner token to the Eve channel cookie", () => {
  const ownerCheck = route.indexOf('await getVerifiedOwnerLogin()');
  const tokenRead = route.indexOf('cookies()).get(OWNER_SESSION_COOKIE)');
  const channelCookie = route.indexOf('buildOwnerChannelCookieHeader(EVE_AGENT_OWNER_COOKIE, token)');
  const sessionStart = route.indexOf('new URL("/eve/v1/session", request.url)');
  assert.ok(ownerCheck >= 0 && tokenRead > ownerCheck && channelCookie > tokenRead && sessionStart > channelCookie);
  assert.match(route, /cookie:\s*channelCookie/);
  assert.match(route, /Eve accepted a Production session with the verified owner channel identity/);
  assert.doesNotMatch(route, /session_id:\s*token/);
});

test("cookie handoff rejects missing, oversized, and injection-shaped values", () => {
  assert.equal(buildOwnerChannelCookieHeader("eve_agent_owner", "gho_0123456789abcdef"), "eve_agent_owner=gho_0123456789abcdef");
  assert.equal(buildOwnerChannelCookieHeader("eve_agent_owner", undefined), null);
  assert.equal(buildOwnerChannelCookieHeader("eve_agent_owner", "x".repeat(4097)), null);
  assert.equal(buildOwnerChannelCookieHeader("eve_agent_owner", "valid; Path=/"), null);
  assert.equal(buildOwnerChannelCookieHeader("bad;name", "valid"), null);
});
