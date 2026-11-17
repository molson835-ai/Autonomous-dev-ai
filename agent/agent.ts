import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { wrapLanguageModel } from "ai";
import { defineAgent } from "eve";
import { createCloudflareNeuronGuard } from "./lib/cloudflare-neuron-guard";
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
  model: wrapLanguageModel({ model: cloudflare.chatModel("@cf/zai-org/glm-4.7-flash"), middleware: createCloudflareNeuronGuard() }),
  modelContextWindowTokens: 131_072,
  limits: { sessionUsage: ({ window }) => window.inputTokens - window.cacheReadTokens >= 16_384 || window.outputTokens >= 4_000 },
});
