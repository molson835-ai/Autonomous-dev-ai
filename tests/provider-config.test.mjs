import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const agent = readFileSync(new URL("../agent/agent.ts", import.meta.url), "utf8");
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

test("Cloudflare Workers AI is the only configured model provider", () => {
  assert.match(agent, /createOpenAICompatible/);
  assert.match(agent, /cloudflare\.chatModel\("@cf\/zai-org\/glm-4\.7-flash"\)/);
  assert.match(agent, /env\.CLOUDFLARE_ACCOUNT_ID/);
  assert.match(agent, /env\.CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(agent, /openai\/|anthropic\/|gateway/i);
  assert.equal(packageJson.dependencies["@ai-sdk/openai-compatible"], "^3.0.87");
});

test("provider configuration defers required credentials until the first model invocation", () => {
  assert.match(agent, /function requireEnv\(name: string\): string/);
  assert.match(agent, /requireEnv\("CLOUDFLARE_ACCOUNT_ID"\)/);
  assert.match(agent, /requireEnv\("CLOUDFLARE_API_TOKEN"\)/);
  assert.match(agent, /function getCloudflareModel\(\)/);
  assert.match(agent, /doGenerate: async/);
  assert.match(agent, /doStream: async/);
  assert.doesNotMatch(agent, /missing-account-id|missing-api-token/);
  assert.doesNotMatch(agent, /fallback|backup|secondary/i);
});

test("provider model context matches the documented model context window", () => {
  assert.match(agent, /modelContextWindowTokens: 16_384/);
  assert.match(agent, /sessionUsage:/);
  assert.match(agent, /createCloudflareNeuronGuard/);
});


test("provider quota exhaustion is converted to a non-retryable error for generate and stream", () => {
  const guard = readFileSync(new URL("../agent/lib/cloudflare-neuron-guard.ts", import.meta.url), "utf8");
  assert.match(guard, /export function nonRetryableQuotaError\(cause: unknown\): Error/);
  assert.match(guard, /error\.name = "EVEQuotaExhaustedError"/);
  assert.match(guard, /new Error\("EVE stopped this model request/);
  assert.equal((guard.match(/throw nonRetryableQuotaError\(error\)/g) ?? []).length, 2);
  assert.doesNotMatch(guard, /catch \(error\) \{ if \(isQuotaError\(error\)\) await circuit\(id\);/);
});
