export function summarizeModelInput(input?: {
  prompt?: Array<{ role?: string; content?: unknown }>;
  tools?: unknown[];
}): {
  prompt_messages: number;
  system_messages: number;
  system_content_chars: number;
  developer_content_chars: number;
  user_content_chars: number;
  assistant_content_chars: number;
  tool_result_content_chars: number;
  other_content_chars: number;
  conversation_content_chars: number;
  prompt_content_chars: number;
  tool_count: number;
  tool_schema_chars: number;
};

export function summarizeModelUsage(usage?: unknown): {
  provider_input_tokens: number | null;
  provider_output_tokens: number | null;
  provider_cached_input_tokens: number | null;
  provider_cache_write_input_tokens: number | null;
  provider_uncached_input_tokens: number | null;
  provider_reasoning_output_tokens: number | null;
  provider_cache_usage_reported: boolean;
};
