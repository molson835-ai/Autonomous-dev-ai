import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { defineAgent } from "eve";
import { env } from "node:process";

const accountId = env.CLOUDFLARE_ACCOUNT_ID ?? "missing-account-id";
const apiToken = env.CLOUDFLARE_API_TOKEN ?? "missing-api-token";

const cloudflare = createOpenAICompatible({
  name: "cloudflare-workers-ai",
  baseURL: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`,
  apiKey: apiToken,
  includeUsage: true,
});

export default defineAgent({
  model: cloudflare.chatModel("@cf/zai-org/glm-4.7-flash"),
  // Keep the configured limit aligned with the model's 128K context window.
  modelContextWindowTokens: 131_072,
  // Compact well before the provider's hard context limit. Tool-heavy sessions
  // otherwise accumulate large histories and can fail at the provider boundary.
  compaction: {
    threshold: 0.65,
  },
  // Bound runaway sessions even when a task keeps invoking tools. The owner can
  // continue an interactive session after reviewing the budget prompt; scheduled
  // work must checkpoint a small unit before reaching this ceiling.
  limits: {
    sessionUsage: ({ window }) =>
      window.inputTokens - window.cacheReadTokens >= 500_000 ||
      window.outputTokens >= 12_000,
  },
});
