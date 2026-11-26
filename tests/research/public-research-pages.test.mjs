import assert from "node:assert/strict";
import test from "node:test";
import { fetchPublicResearchPages, fetchResearchSources, PUBLIC_RESEARCH_HOSTS } from "../../agent/research/sources.ts";

const html = (title = "Inventory guidance", body = "Small businesses should reconcile physical inventory records and investigate receiving differences.") =>
  "<!doctype html><html><head><title>" + title + "</title></head><body><main><h1>" + title + "</h1><p>" + body + "</p></main></body></html>";
const response = (body, headers = { "content-type": "text/html; charset=utf-8" }, status = 200) =>
  new Response(body, { status, headers });

test("retrieves excerpts from an allowlisted public business source", async () => {
  const calls = [];
  const output = await fetchPublicResearchPages(["https://www.sba.gov/business-guide/manage-your-business"], "small business inventory", async (url, init) => {
    calls.push({ url, init }); return response(html());
  });
  assert.equal(calls.length, 1);
  assert.equal(output[0].status, 200);
  assert.equal(output[0].title, "Inventory guidance");
  assert.match(output[0].excerpt, /inventory records/);
  assert.equal(output[0].diagnostic, "ok");
});

test("rejects non-allowlisted hosts before making a request", async () => {
  let calls = 0;
  const output = await fetchPublicResearchPages(["https://unknown-publisher.example/story"], "market demand", async () => {
    calls++; return response(html());
  });
  assert.equal(calls, 0);
  assert.equal(output[0].status, 0);
  assert.match(output[0].error, /allowlist/);
});

test("rejects credentials, explicit ports, and non-HTTPS URLs", async () => {
  let calls = 0;
  const urls = ["http://www.sba.gov/story", "https://user:secret@www.sba.gov/story", "https://www.sba.gov:8443/story"];
  const output = await fetchPublicResearchPages(urls, "business research", async () => {
    calls++; return response(html());
  });
  assert.equal(calls, 0);
  assert.ok(output.every(item => item.error));
});

test("revalidates redirects and never requests an unapproved destination", async () => {
  const calls = [];
  const output = await fetchPublicResearchPages(["https://www.sba.gov/start"], "small business", async (url, init) => {
    calls.push({ url, init });
    return new Response(null, { status: 302, headers: { location: "https://attacker.example/collect" } });
  });
  assert.equal(calls.length, 1);
  assert.match(output[0].error, /allowlist/);
});

test("rejects non-text response content types", async () => {
  const output = await fetchPublicResearchPages(["https://www.sba.gov/file"], "business research", async () =>
    response("not text", { "content-type": "application/octet-stream" }));
  assert.equal(output[0].status, 0);
  assert.match(output[0].error, /content type/);
});

test("marks oversized responses as truncated and bounds excerpts", async () => {
  const output = await fetchPublicResearchPages(["https://www.sba.gov/large"], "small business", async () =>
    response(html("Large page", "x".repeat(1_000_100))));
  assert.equal(output[0].truncated, true);
  assert.equal(output[0].diagnostic, "partial-response-size-limit");
  assert.ok(output[0].excerpt.length <= 8_000);
});

test("caps retrieval at five unique URLs", async () => {
  let calls = 0;
  const urls = ["a","a","b","c","d","e","f"].map(x => "https://www.sba.gov/" + x);
  const output = await fetchPublicResearchPages(urls, "small business", async () => {
    calls++; return response(html());
  });
  assert.equal(calls, 5);
  assert.equal(output.length, 5);
});

test("keeps technical and business allowlists separate", async () => {
  let calls = 0;
  const technical = await fetchResearchSources(["https://www.sba.gov/business-guide"], "technical docs", async () => {
    calls++; return response(html());
  });
  assert.equal(calls, 0);
  assert.match(technical[0].error, /allowlist/);
  assert.ok(PUBLIC_RESEARCH_HOSTS.includes("www.sba.gov"));
  assert.ok(!PUBLIC_RESEARCH_HOSTS.includes("attacker.example"));
});

test("rejects malformed URLs without making a request", async () => {
  const output = await fetchPublicResearchPages(["not a URL"], "business research", async () => {
    throw new Error("must not fetch");
  });
  assert.equal(output[0].status, 0);
  assert.match(output[0].error, /Invalid source URL/);
});
