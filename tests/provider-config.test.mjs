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
  assert.match(agent, /CLOUDFLARE_ACCOUNT_ID/);
  assert.match(agent, /CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(agent, /openai\/|anthropic\/|gateway/i);
  assert.equal(packageJson.dependencies["@ai-sdk/openai-compatible"], "^3.0.87");
});

test("provider configuration cannot silently use a real credential when unset", () => {
  assert.match(agent, /"missing-account-id"/);
  assert.match(agent, /"missing-api-token"/);
  assert.doesNotMatch(agent, /fallback|backup|secondary/i);
});

test("provider model context matches the documented model context window", () => {
  assert.match(agent, /modelContextWindowTokens: 131_072/);
});
