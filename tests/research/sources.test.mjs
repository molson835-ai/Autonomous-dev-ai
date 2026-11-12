import assert from "node:assert/strict";
import test from "node:test";
import {
  extractPageText,
  fetchResearchSources,
  validateResearchUrl,
} from "../../agent/research/sources.ts";

function response(body, { status = 200, contentType = "text/html; charset=utf-8", headers = {} } = {}) {
  return new Response(body, {
    status,
    headers: { "content-type": contentType, ...headers },
  });
}

test("accepts only exact approved HTTPS documentation hosts", () => {
  assert.equal(validateResearchUrl("https://developer.mozilla.org/en-US/docs/Web/JavaScript").hostname, "developer.mozilla.org");
  for (const url of [
    "http://developer.mozilla.org/docs",
    "https://evil.example/developer.mozilla.org",
    "https://developer.mozilla.org.evil.example/docs",
    "https://user:pass@developer.mozilla.org/docs",
    "https://developer.mozilla.org:8443/docs",
    "file:///etc/passwd",
  ]) assert.throws(() => validateResearchUrl(url));
});

test("extracts readable HTML while dropping script and navigation content", () => {
  const result = extractPageText(
    "<html><title>Docs &amp; Guide</title><nav>menu</nav><script>ignore me</script><main>Hello&nbsp;world</main></html>",
    "text/html",
  );
  assert.equal(result.title, "Docs & Guide");
  assert.equal(result.text, "Hello world");
  assert.doesNotMatch(result.text, /ignore me|menu/);
});

test("fetches a permitted source and returns a bounded citation excerpt", async () => {
  const results = await fetchResearchSources(
    ["https://developer.mozilla.org/en-US/docs/Web/JavaScript"],
    async () => response("<title>JavaScript</title><main>Reference text</main>"),
  );
  assert.equal(results[0].status, 200);
  assert.equal(results[0].title, "JavaScript");
  assert.equal(results[0].url, "https://developer.mozilla.org/en-US/docs/Web/JavaScript");
  assert.match(results[0].excerpt, /Reference text/);
});

test("rejects redirects to hosts outside the allowlist", async () => {
  const results = await fetchResearchSources(
    ["https://developer.mozilla.org/start"],
    async () => response("", { status: 302, headers: { location: "https://evil.example/steal" } }),
  );
  assert.match(results[0].error, /allowlist/);
});

test("revalidates allowed redirects and returns the final URL", async () => {
  let calls = 0;
  const results = await fetchResearchSources(
    ["https://developer.mozilla.org/start"],
    async () => {
      calls += 1;
      return calls === 1
        ? response("", { status: 301, headers: { location: "/final" } })
        : response("<title>Final</title><p>Body</p>");
    },
  );
  assert.equal(calls, 2);
  assert.equal(results[0].url, "https://developer.mozilla.org/final");
  assert.equal(results[0].title, "Final");
});

test("rejects non-document content types", async () => {
  const results = await fetchResearchSources(
    ["https://developer.mozilla.org/file"],
    async () => response("binary", { contentType: "application/octet-stream" }),
  );
  assert.match(results[0].error, /content type/);
});

test("deduplicates URLs and caps the source list at five", async () => {
  let calls = 0;
  const urls = [
    "https://developer.mozilla.org/a",
    "https://developer.mozilla.org/a",
    "https://tc39.es/b",
    "https://owasp.org/c",
    "https://developers.cloudflare.com/d",
    "https://vercel.com/docs/e",
    "https://vercel.com/docs/f",
  ];
  const results = await fetchResearchSources(urls, async () => {
    calls += 1;
    return response("text", { contentType: "text/plain" });
  });
  assert.equal(calls, 5);
  assert.equal(results.length, 5);
});

test("reports HTTP failures without treating them as evidence", async () => {
  const results = await fetchResearchSources(
    ["https://developer.mozilla.org/missing"],
    async () => response("not found", { status: 404 }),
  );
  assert.equal(results[0].status, 404);
  assert.equal(results[0].excerpt, "");
});

test("plain text extraction preserves content and normalizes whitespace", () => {
  assert.deepEqual(extractPageText(" alpha\n beta ", "text/plain"), {
    title: "",
    text: "alpha beta",
  });
});
