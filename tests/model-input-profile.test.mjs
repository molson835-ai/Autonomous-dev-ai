import test from "node:test";
import assert from "node:assert/strict";
import { summarizeModelInput } from "../agent/lib/model-input-profile.mjs";

test("summarizes system, conversation, and tool payload sizes without returning content", () => {
  const result = summarizeModelInput({
    prompt: [
      { role: "system", content: "permanent rules" },
      { role: "user", content: [{ type: "text", text: "private user text" }] },
      { role: "tool", content: [{ type: "tool-result", output: { type: "json", value: { secret: "private result" } } }] },
    ],
    tools: [{ name: "research", description: "private tool description", inputSchema: { type: "object" } }],
  });

  assert.deepEqual(result, {
    prompt_messages: 3,
    system_messages: 1,
    system_content_chars: 17,
    conversation_content_chars: JSON.stringify([
      { type: "text", text: "private user text" },
    ]).length + JSON.stringify([
      { type: "tool-result", output: { type: "json", value: { secret: "private result" } } },
    ]).length,
    prompt_content_chars: 17 + JSON.stringify([
      { type: "text", text: "private user text" },
    ]).length + JSON.stringify([
      { type: "tool-result", output: { type: "json", value: { secret: "private result" } } },
    ]).length,
    tool_count: 1,
    tool_schema_chars: JSON.stringify([{ name: "research", description: "private tool description", inputSchema: { type: "object" } }]).length,
  });
  assert.equal(JSON.stringify(result).includes("private"), false);
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("handles missing or malformed prompt and tool collections", () => {
  assert.deepEqual(summarizeModelInput(), {
    prompt_messages: 0,
    system_messages: 0,
    system_content_chars: 0,
    conversation_content_chars: 0,
    prompt_content_chars: 0,
    tool_count: 0,
    tool_schema_chars: 2,
  });
});
