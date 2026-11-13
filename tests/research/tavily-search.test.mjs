import test from "node:test";
import assert from "node:assert/strict";
import { searchTavily } from "../../agent/research/tavily-search.mjs";

const response = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });

test("requires an API key and makes no request when absent", async () => {
  let calls = 0;
  await assert.rejects(searchTavily("seller inventory tools", {}, { apiKey: "", fetchImpl: async () => { calls++; return response({ results: [] }); } }), /TAVILY_API_KEY is not configured/);
  assert.equal(calls, 0);
});

test("uses bounded basic safe search and returns only sanitized HTTPS results", async () => {
  let captured;
  const result = await searchTavily("seller inventory tools", { maxResults: 2, topic: "general", timeRange: "month" }, {
    apiKey: "test-only-key",
    fetchImpl: async (url, init) => {
      captured = { url, init, body: JSON.parse(init.body) };
      return response({ usage: { credits: 1 }, results: [
        { title: "Useful result", url: "https://example.com/article", content: "Evidence snippet", score: 0.9, published_date: "2026-11-01" },
        { title: "Unsafe result", url: "javascript:alert(1)", content: "Do not return this" },
        { title: "Extra result", url: "https://extra.example/path", content: "Beyond requested limit" },
      ] });
    },
  });
  assert.equal(captured.url, "https://api.tavily.com/search");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.headers.authorization, "Bearer test-only-key");
  assert.equal(captured.body.search_depth, "basic");
  assert.equal(captured.body.max_results, 2);
  assert.equal(captured.body.time_range, "month");
  assert.equal(captured.body.safe_search, true);
  assert.equal(captured.body.include_answer, false);
  assert.equal(captured.body.include_raw_content, false);
  assert.equal(captured.body.include_images, false);
  assert.equal(result.usageCredits, 1);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].url, "https://example.com/article");
  assert.equal(result.results[0].snippet, "Evidence snippet");
});

test("rejects invalid inputs before network access", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return response({ results: [] }); };
  for (const [query, options] of [["x", {}], ["valid query", { maxResults: 6 }], ["valid query", { maxResults: 0 }], ["valid query", { topic: "finance" }], ["valid query", { timeRange: "decade" }]]) {
    await assert.rejects(searchTavily(query, options, { apiKey: "test-key", fetchImpl }));
  }
  assert.equal(calls, 0);
});

test("stops on exhausted quota without retry or paid fallback", async () => {
  let calls = 0;
  await assert.rejects(searchTavily("seller inventory tools", {}, { apiKey: "test-key", fetchImpl: async () => { calls++; return response({ detail: "quota" }, 432); } }), /quota or plan limit reached/);
  assert.equal(calls, 1);
});

test("does not retry rate limits or disclose provider response details", async () => {
  let calls = 0;
  await assert.rejects(searchTavily("seller inventory tools", {}, { apiKey: "test-key", fetchImpl: async () => { calls++; return response({ detail: "secret provider text" }, 429); } }), error => {
    assert.match(error.message, /rate-limited/);
    assert.doesNotMatch(error.message, /secret provider text/);
    return true;
  });
  assert.equal(calls, 1);
});

test("rejects unauthorized credentials without exposing the key", async () => {
  await assert.rejects(searchTavily("seller inventory tools", {}, { apiKey: "never-print-this", fetchImpl: async () => response({ detail: "unauthorized" }, 401) }), error => {
    assert.match(error.message, /credentials were rejected/);
    assert.doesNotMatch(error.message, /never-print-this/);
    return true;
  });
});
