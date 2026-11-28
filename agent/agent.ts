import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { wrapLanguageModel } from "ai";
import { defineAgent } from "eve";
import { createCloudflareNeuronGuard } from "./lib/cloudflare-neuron-guard";
import { isGeminiFreeTierFallbackEnabled, GEMINI_FREE_TIER_MODEL } from "./lib/gemini-fallback-policy.mjs";
import { env } from "node:process";

const accountId = env.CLOUDFLARE_ACCOUNT_ID ?? "missing-account-id";
const apiToken = env.CLOUDFLARE_API_TOKEN ?? "missing-api-token";

const cloudflare = createOpenAICompatible({
  name: "cloudflare-workers-ai",
  baseURL: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`,
  apiKey: apiToken,
  includeUsage: true,
});

// A Gemini key is insufficient by itself. The owner must explicitly enable
// the fallback and attest that the Google project has no billing account.
const geminiEnabled = isGeminiFreeTierFallbackEnabled({
  apiKey: env.GEMINI_API_KEY,
  enabled: env.GEMINI_FREE_TIER_ENABLED,
  billingAccountAttached: env.GEMINI_BILLING_ACCOUNT_ATTACHED,
});
const gemini = geminiEnabled
  ? createOpenAICompatible({
      name: "google-gemini-free-tier",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      apiKey: env.GEMINI_API_KEY!,
      includeUsage: true,
    })
  : undefined;
const geminiFallbackModel = gemini?.chatModel(GEMINI_FREE_TIER_MODEL);

// Production Agent Run telemetry recorded 71,883 uncached input tokens in a
// fresh first turn. Eve checks this cap before each subsequent model call, so
// a lower limit can stop the tool loop before task_transition closes the task.
// Allow several full-context tool turns, while keeping the cumulative session
// budget finite. Per-call context remains capped separately at 131,072 tokens.
const MAX_SESSION_INPUT_TOKENS = 400_000;
const MAX_SESSION_OUTPUT_TOKENS = 4_000;

export default defineAgent({
  // Keep only explicitly authored application tools. The framework's optional
  // shell, filesystem, web, and other default tools are not approved for Eve.
  defaultTools: false,
  // Prevent model-initiated root-copy delegation while authorization is reviewed.
  tool: false,
  model: wrapLanguageModel({
    model: cloudflare.chatModel("@cf/zai-org/glm-4.7-flash"),
    middleware: createCloudflareNeuronGuard(geminiFallbackModel),
  }),
  modelContextWindowTokens: 131_072,
  limits: {
    sessionUsage: ({ window }) =>
      window.inputTokens - window.cacheReadTokens >= MAX_SESSION_INPUT_TOKENS ||
      window.outputTokens >= MAX_SESSION_OUTPUT_TOKENS,
  },
});
