import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../apps/web/app/api/internal/cloudflare-credential-check/route.ts", import.meta.url), "utf8");

test("Cloudflare credential diagnostic is operator-authenticated and read-only", () => {
  assert.match(route, /export async function POST/);
  assert.match(route, /EVE_DIAGNOSTIC_TOKEN/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /authorization:\\s*"Bearer "\\s*\\+\\s*apiToken/);
  assert.match(route, /api\\.cloudflare\\.com\\/client\\/v4\\/graphql/);
  assert.doesNotMatch(route, /\\/ai\\/v1|Workers AI|generateText|streamText|fetch\\([^)]*session/i);
});

test("diagnostic response exposes only credential permission status, never token or usage", () => {
  assert.match(route, /credential:\\s*"valid"/);
  assert.match(route, /permission:\\s*"analytics_read"/);
  assert.doesNotMatch(route, /totalNeurons\\s*[,}]|apiToken\\s*[,}]|accountId\\s*[,}]/);
  assert.match(route, /Cache-Control.*no-store/);
});
