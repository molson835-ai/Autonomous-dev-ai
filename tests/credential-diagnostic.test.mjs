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
  assert.match(route, /tokenStatus !== "active"/);
  assert.match(route, /aiInferenceAdaptiveGroups/);
  assert.match(route, /totalNeurons/);
});

test("diagnostic returns safe Cloudflare errors with sensitive values redacted", () => {
  assert.match(route, /safeCloudflareErrors/);
  assert.match(route, /replaceAll\(accountId, "\[account\]"\)/);
  assert.match(route, /redacted-token/);
  assert.match(route, /cloudflareErrors: errors/);
  assert.match(route, /Cache-Control.*no-store/);
  // accountId is a legitimate local parameter; credential values must never
  // be serialized as response object fields.
  assert.doesNotMatch(route, /(?:Response\.json|failure)\([\s\S]{0,500}\b(?:apiToken|accountId)\s*:/);
});
