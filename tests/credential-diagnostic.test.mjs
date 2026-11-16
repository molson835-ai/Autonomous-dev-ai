import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../apps/web/app/api/internal/cloudflare-credential-check/route.ts", import.meta.url), "utf8");

test("Cloudflare credential diagnostic is operator-authenticated and read-only", () => {
  assert.match(route, /export async function POST/);
  assert.match(route, /EVE_DIAGNOSTIC_TOKEN/);
  assert.match(route, /timingSafeEqual/);
  assert.ok(route.includes('authorization: "Bearer " + apiToken'));
  assert.ok(route.includes("/graphql"));
  assert.doesNotMatch(route, /\/ai\/v1|generateText|streamText/);
});

test("diagnostic verifies account-owned token status before querying Analytics", () => {
  assert.match(route, /\/accounts\/\$\{accountId\}\/tokens\/verify/);
  assert.match(route, /verifyPayload\?\.result\?\.status !== "active"/);
  assert.match(route, /aiInferenceAdaptiveGroups/);
  assert.match(route, /totalNeurons/);
});

test("diagnostic returns safe Cloudflare errors with sensitive values redacted", () => {
  assert.match(route, /safeErrors/);
  assert.match(route, /replaceAll\(accountId, "\[account\]"\)/);
  assert.match(route, /redacted-token/);
  assert.match(route, /cloudflareErrors: safeErrors\(/);
  assert.match(route, /errors: result\.errors/);
  assert.match(route, /Cache-Control.*no-store/);
  // Credential/account values must never be emitted as named response fields.
  assert.doesNotMatch(route, /\bapiToken\s*:/);
  assert.doesNotMatch(route, /\baccountId\s*:\s*accountId\b/);
});
