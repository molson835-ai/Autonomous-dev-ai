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

// A fresh scheduled session's first prompt currently consumes about 16.8k
// uncached input tokens (observed in Production). Keep the per-session cap
// above that startup cost so the workflow can complete more than one model
// step. The 65,536-token ceiling remains below half the model context window;
// the output ceiling still bounds long generations.
const MAX_SESSION_INPUT_TOKENS = 65_536;
const MAX_SESSION_OUTPUT_TOKENS = 4_000;

export default defineAgent({
  model: wrapLanguageModel({ model: cloudflare.chatModel("@cf/zai-org/glm-4.7-flash"), middleware: createCloudflareNeuronGuard() }),
  modelContextWindowTokens: 131_072,
  limits: {
    sessionUsage: ({ window }) =>
      window.inputTokens - window.cacheReadTokens >= MAX_SESSION_INPUT_TOKENS ||
      window.outputTokens >= MAX_SESSION_OUTPUT_TOKENS,
  },
});
