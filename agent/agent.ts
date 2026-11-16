import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import { wrapLanguageModel } from "ai";
import { defineAgent } from "eve";
import { createCloudflareNeuronGuard } from "./lib/cloudflare-neuron-guard";
import { env } from "node:process";

const MODEL_ID = "@cf/zai-org/glm-4.7-flash";

function requireEnv(name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error("Missing required environment variable: " + name);
  return value;
}

let cloudflareModel: LanguageModelV4 | undefined;

function getCloudflareModel(): LanguageModelV4 {
  if (cloudflareModel) return cloudflareModel;

  // Resolve credentials only when the first model request is made. This keeps
  // build-time imports credential-free while ensuring runtime fails closed.
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = requireEnv("CLOUDFLARE_API_TOKEN");
  const cloudflare = createOpenAICompatible({
    name: "cloudflare-workers-ai",
    baseURL: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`,
    apiKey: apiToken,
    includeUsage: true,
  });
  cloudflareModel = cloudflare.chatModel(MODEL_ID);
  return cloudflareModel;
}

const lazyCloudflareModel: LanguageModelV4 = {
  specificationVersion: "v4",
  provider: "cloudflare-workers-ai",
  modelId: MODEL_ID,
  supportedUrls: {},
  doGenerate: async (options) => getCloudflareModel().doGenerate(options),
  doStream: async (options) => getCloudflareModel().doStream(options),
};

export default defineAgent({
  model: wrapLanguageModel({
    model: lazyCloudflareModel,
    middleware: createCloudflareNeuronGuard(),
  }),
  modelContextWindowTokens: 16_384,
  limits: {
    sessionUsage: ({ window }) =>
      window.inputTokens - window.cacheReadTokens >= 16_384 ||
      window.outputTokens >= 4_000,
  },
});
