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

export function summarizeModelInput({ prompt, tools } = {}) {
  const messages = Array.isArray(prompt) ? prompt : [];
  let systemChars = 0;
  let historyChars = 0;
  let systemMessages = 0;

  for (const message of messages) {
    const size = jsonLength(message?.content);
    if (message?.role === "system") {
      systemMessages += 1;
      systemChars += size;
    } else {
      historyChars += size;
    }
  }

  const toolList = Array.isArray(tools) ? tools : [];
  return {
    prompt_messages: messages.length,
    system_messages: systemMessages,
    system_content_chars: systemChars,
    conversation_content_chars: historyChars,
    prompt_content_chars: systemChars + historyChars,
    tool_count: toolList.length,
    tool_schema_chars: jsonLength(toolList),
  };
}
