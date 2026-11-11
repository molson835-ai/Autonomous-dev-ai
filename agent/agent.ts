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
  modelContextWindowTokens: 131_072,
});
