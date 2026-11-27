import test from "node:test";
import assert from "node:assert/strict";
import { summarizeModelInput, summarizeModelUsage } from "../agent/lib/model-input-profile.mjs";

test("summarizes prompt role sizes without returning prompt or tool content", () => {
  const result = summarizeModelInput({
    prompt: [
      { role: "system", content: "permanent rules" },
      { role: "developer", content: "developer-only instruction" },
      { role: "user", content: [{ type: "text", text: "private user text" }] },
      { role: "assistant", content: "private assistant response" },
      { role: "tool", content: [{ type: "tool-result", output: { type: "json", value: { secret: "private result" } } }] },
    ],
    tools: [{ name: "research", description: "private tool description", inputSchema: { type: "object" } }],
  });

  assert.equal(result.prompt_messages, 5);
  assert.equal(result.system_messages, 1);
  assert.equal(result.system_content_chars, JSON.stringify("permanent rules").length);
  assert.equal(result.developer_content_chars, JSON.stringify("developer-only instruction").length);
  assert.equal(result.user_content_chars, JSON.stringify([{ type: "text", text: "private user text" }]).length);
  assert.equal(result.assistant_content_chars, JSON.stringify("private assistant response").length);
  assert.equal(result.tool_result_content_chars, JSON.stringify([
    { type: "tool-result", output: { type: "json", value: { secret: "private result" } } },
  ]).length);
  assert.equal(result.prompt_content_chars, result.system_content_chars
    + result.developer_content_chars + result.user_content_chars
    + result.assistant_content_chars + result.tool_result_content_chars
    + result.other_content_chars);
  assert.equal(result.tool_count, 1);
  assert.equal(result.tool_schema_chars, JSON.stringify([
    { name: "research", description: "private tool description", inputSchema: { type: "object" } },
  ]).length);
  assert.equal(JSON.stringify(result).includes("private"), false);
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("handles missing or malformed prompt and tool collections", () => {
  assert.deepEqual(summarizeModelInput(), {
    prompt_messages: 0,
    system_messages: 0,
    system_content_chars: 0,
    developer_content_chars: 0,
    user_content_chars: 0,
    assistant_content_chars: 0,
    tool_result_content_chars: 0,
    other_content_chars: 0,
    conversation_content_chars: 0,
    prompt_content_chars: 0,
    tool_count: 0,
    tool_schema_chars: 2,
  });
});

test("records provider cache and reasoning metrics without inferring missing values", () => {
  assert.deepEqual(summarizeModelUsage({
    inputTokens: { total: 1200, noCache: 800, cacheRead: 400, cacheWrite: 20 },
    outputTokens: { total: 90, reasoning: 30 },
  }), {
    provider_input_tokens: 1200,
    provider_output_tokens: 90,
    provider_cached_input_tokens: 400,
    provider_cache_write_input_tokens: 20,
    provider_uncached_input_tokens: 800,
    provider_reasoning_output_tokens: 30,
    provider_cache_usage_reported: true,
  });
});

test("supports alternate SDK cache-detail fields and omits unavailable metrics", () => {
  assert.deepEqual(summarizeModelUsage({
    inputTokens: { total: 50 },
    outputTokens: { total: 10 },
    inputTokenDetails: { cacheReadTokens: 12, cacheWriteTokens: 3 },
  }), {
    provider_input_tokens: 50,
    provider_output_tokens: 10,
    provider_cached_input_tokens: 12,
    provider_cache_write_input_tokens: 3,
    provider_uncached_input_tokens: null,
    provider_reasoning_output_tokens: null,
    provider_cache_usage_reported: true,
  });
  assert.deepEqual(summarizeModelUsage(), {
    provider_input_tokens: null,
    provider_output_tokens: null,
    provider_cached_input_tokens: null,
    provider_cache_write_input_tokens: null,
    provider_uncached_input_tokens: null,
    provider_reasoning_output_tokens: null,
    provider_cache_usage_reported: false,
  });
});
