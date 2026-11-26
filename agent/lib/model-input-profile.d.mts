export function summarizeModelInput(input?: {
  prompt?: Array<{ role?: string; content?: unknown }>;
  tools?: unknown[];
}): {
  prompt_messages: number;
  system_messages: number;
  system_content_chars: number;
  conversation_content_chars: number;
  prompt_content_chars: number;
  tool_count: number;
  tool_schema_chars: number;
};
