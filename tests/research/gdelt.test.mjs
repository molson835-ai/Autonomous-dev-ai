import assert from "node:assert/strict";
import test from "node:test";
import { searchGdeltNews } from "../../agent/research/gdelt.ts";

function jsonResponse(value, { status = 200, contentType = "application/json; charset=utf-8" } = {}) { return new Response(JSON.stringify(value), { status, headers: { "content-type": contentType } }); }

test("searches only the fixed GDELT endpoint with bounded parameters", async () => {
  let requested;
  const result = await searchGdeltNews("local business software", { timespan: "1week", maxRecords: 2 }, async (input, init) => { requested = { url: new URL(String(input)), init }; return jsonResponse({ articles: [{ title: "First", url: "https://publisher.example/one", domain: "publisher.example", seendate: "20261115010000", language: "English", sourcecountry: "US" }, { title: "Second", url: "https://publisher.example/two" }, { title: "Third", url: "https://publisher.example/three" }] }); });
  assert.equal(requested.url.origin, "https://api.gdeltproject.org"); assert.equal(requested.url.pathname, "/api/v2/doc/doc");
  assert.equal(requested.url.searchParams.get("query"), "local business software"); assert.equal(requested.url.searchParams.get("mode"), "artlist");
  assert.equal(requested.url.searchParams.get("format"), "json"); assert.equal(requested.url.searchParams.get("maxrecords"), "2");
  assert.equal(requested.init.redirect, "error"); assert.equal(result.articles.length, 2); assert.equal(result.articles[0].domain, "publisher.example");
  assert.match(result.attribution, /gdeltproject.org/);
});

test("rejects invalid query and parameter bounds before network access", async () => {
  let calls = 0; const fetcher = async () => { calls += 1; return jsonResponse({ articles: [] }); };
  await assert.rejects(searchGdeltNews("  ", {}, fetcher), /query/); await assert.rejects(searchGdeltNews("x".repeat(301), {}, fetcher), /query/);
  await assert.rejects(searchGdeltNews("ok", { maxRecords: 11 }, fetcher), /maxRecords/); await assert.rejects(searchGdeltNews("ok", { timespan: "90days" }, fetcher), /timespan/);
  assert.equal(calls, 0);
});

test("drops malformed, non-HTTPS, and credential-bearing article links", async () => {
  const result = await searchGdeltNews("test", {}, async () => jsonResponse({ articles: [{ title: "HTTP", url: "http://publisher.example/a" }, { title: "Credentials", url: "https://user:pass@publisher.example/b" }, { title: "No URL" }, { title: "Valid", url: "https://publisher.example/good" }] }));
  assert.deepEqual(result.articles.map(item => item.title), ["Valid"]);
});

test("fails closed on provider rate limits without retrying", async () => {
  let calls = 0; await assert.rejects(searchGdeltNews("test", {}, async () => { calls += 1; return new Response("rate limited", { status: 429 }); }), /rate limit/); assert.equal(calls, 1);
});

test("returns an explicit non-retryable result when the request times out", async () => {
  let calls = 0;
  const result = await searchGdeltNews("test", {}, async () => { calls += 1; const error = new Error("request timed out"); error.name = "TimeoutError"; throw error; });
  assert.equal(calls, 1);
  assert.deepEqual(result.unavailable, { reason: "timeout", retryable: false });
  assert.deepEqual(result.articles, []);
});

test("rejects unexpected content types and malformed response shapes", async () => {
  await assert.rejects(searchGdeltNews("test", {}, async () => new Response("<html>error</html>", { headers: { "content-type": "text/html" } })), /content type/);
  await assert.rejects(searchGdeltNews("test", {}, async () => jsonResponse({ results: [] })), /article list/);
});

test("rejects oversized response data", async () => {
  await assert.rejects(searchGdeltNews("test", {}, async () => new Response("x".repeat(256_001), { headers: { "content-type": "application/json" } })), /size limit/);
});