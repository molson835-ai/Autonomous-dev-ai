import type { LanguageModelV4 } from "@ai-sdk/provider";

export declare function createGeminiFallbackError(cause: unknown): Error;

export declare function reserveOrRunWithGeminiFallback(options: {
  reserve: () => Promise<string>;
  fallbackModel?: LanguageModelV4;
  params: Parameters<LanguageModelV4["doGenerate"]>[0];
  mode: "generate" | "stream";
  onFallback?: () => void;
}): Promise<
  | { kind: "primary"; reservationId: string }
  | { kind: "fallback"; result: any }
>;
