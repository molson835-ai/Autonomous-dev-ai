/**
 * Return numeric-only measurements of the model request payload.
 * Never return or log prompt text, tool descriptions, schemas, or user data.
 */
function jsonLength(value) {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

function finiteTokenCount(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function firstTokenCount(...values) {
  for (const value of values) {
    const count = finiteTokenCount(value);
    if (count !== null) return count;
  }
  return null;
}

export function summarizeModelInput({ prompt, tools } = {}) {
  const messages = Array.isArray(prompt) ? prompt : [];
  const roleChars = {
    system: 0,
    developer: 0,
    user: 0,
    assistant: 0,
    tool: 0,
    other: 0,
  };

  for (const message of messages) {
    const size = jsonLength(message?.content);
    const role = Object.hasOwn(roleChars, message?.role) ? message.role : "other";
    roleChars[role] += size;
  }

  const toolList = Array.isArray(tools) ? tools : [];
  const systemChars = roleChars.system;
  const conversationChars = roleChars.developer + roleChars.user
    + roleChars.assistant + roleChars.tool + roleChars.other;

  return {
    prompt_messages: messages.length,
    system_messages: messages.filter((message) => message?.role === "system").length,
    system_content_chars: systemChars,
    developer_content_chars: roleChars.developer,
    user_content_chars: roleChars.user,
    assistant_content_chars: roleChars.assistant,
    tool_result_content_chars: roleChars.tool,
    other_content_chars: roleChars.other,
    conversation_content_chars: conversationChars,
    prompt_content_chars: systemChars + conversationChars,
    tool_count: toolList.length,
    tool_schema_chars: jsonLength(toolList),
  };
}

/**
 * Normalize only numeric usage metadata supplied by the model provider/SDK.
 * AI SDK versions expose cache details in either inputTokens or
 * inputTokenDetails; keep absent values null rather than inferring zero.
 */
export function summarizeModelUsage(usage) {
  const value = usage && typeof usage === "object" ? usage : {};
  const input = value.inputTokens && typeof value.inputTokens === "object"
    ? value.inputTokens : {};
  const output = value.outputTokens && typeof value.outputTokens === "object"
    ? value.outputTokens : {};
  const inputDetails = value.inputTokenDetails && typeof value.inputTokenDetails === "object"
    ? value.inputTokenDetails : {};
  const outputDetails = value.outputTokenDetails && typeof value.outputTokenDetails === "object"
    ? value.outputTokenDetails : {};

  const cachedInput = firstTokenCount(
    input.cacheRead, input.cacheReadTokens,
    inputDetails.cacheReadTokens, inputDetails.cachedInputTokens,
    value.cachedInputTokens,
  );
  const cacheWriteInput = firstTokenCount(
    input.cacheWrite, input.cacheWriteTokens,
    inputDetails.cacheWriteTokens,
  );
  const uncachedInput = firstTokenCount(
    input.noCache, input.uncached,
    inputDetails.noCacheTokens, inputDetails.uncachedInputTokens,
  );
  const reasoningOutput = firstTokenCount(
    output.reasoning, output.reasoningTokens,
    outputDetails.reasoningTokens,
  );

  return {
    provider_input_tokens: firstTokenCount(input.total, value.inputTokens),
    provider_output_tokens: firstTokenCount(output.total, value.outputTokens),
    provider_cached_input_tokens: cachedInput,
    provider_cache_write_input_tokens: cacheWriteInput,
    provider_uncached_input_tokens: uncachedInput,
    provider_reasoning_output_tokens: reasoningOutput,
    provider_cache_usage_reported: cachedInput !== null || cacheWriteInput !== null || uncachedInput !== null,
  };
}
