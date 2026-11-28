export declare const GEMINI_FREE_TIER_MODEL: "gemini-3.8-flash";

export declare function isGeminiFreeTierFallbackEnabled(options?: {
  apiKey?: string;
  enabled?: string;
  billingAccountAttached?: string;
}): boolean;

export declare function isLocalNeuronBudgetFallback(error: unknown): boolean;
