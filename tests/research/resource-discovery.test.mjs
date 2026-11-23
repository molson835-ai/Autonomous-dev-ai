import test from "node:test";
import assert from "node:assert/strict";
import { discoverPublicResources } from "../../agent/research/resource-discovery.mjs";

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) };
}

test("discovers bounded GitHub, Hugging Face, and npm metadata and stores only quarantined candidates", async () => {
  const calls = [];
  const stored = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: new URL(url), init });
    const host = new URL(url).hostname;
    if (host === "api.github.com") return response({ items: [{
      full_name: "owner/sample-tool", description: "A test tool", owner: { login: "owner" },
      license: { spdx_id: "MIT" }, default_branch: "main", topics: ["testing"]
    }] });
    if (host === "huggingface.co") return response([{
      modelId: "org/sample-model", author: "org", pipeline_tag: "text-generation",
      sha: "abc123", cardData: { license: "apache-2.0" }, tags: ["text-generation"]
    }]);
    if (host === "registry.npmjs.org") return response({ objects: [{
      package: { name: "@scope/sample-lib", description: "A library", version: "1.2.3", license: "MIT", publisher: { username: "maintainer" }, keywords: ["utility"] }
    }] });
    throw new Error("Unexpected host");
  };
  const result = await discoverPublicResources({
    query: "local data tools", limitPerCatalog: 1, fetchImpl,
    now: () => "2026-11-23T22:00:00.000Z",
    submitCandidate: async candidate => {
      stored.push(candidate);
      return { id: candidate.id, trust_state: "quarantined", created: true };
    }
  });
  assert.equal(calls.length, 3);
  assert.equal(result.discovered_count, 3);
  assert.equal(result.stored_quarantined_count, 3);
  assert.equal(stored.length, 3);
  assert.ok(calls.every(call => call.init.method === "GET" && call.init.redirect === "error"));
  assert.ok(stored.every(item => !Object.hasOwn(item, "trust_state")));
  assert.ok(result.results.every(source => source.candidates.every(item => item.storage_result === "quarantined_new")));
  assert.ok(stored.every(item => item.commercial_use === "unknown" && item.cost_model === "unknown"));
  assert.ok(stored.every(item => item.data_classes_allowed.join(",") === "public"));
  assert.equal(stored[0].license, "MIT");
  assert.equal(stored[1].license, "apache-2.0");
  assert.equal(stored[2].source_url, "https://www.npmjs.com/package/@scope/sample-lib");
});

test("returns source-level errors without retrying or pretending candidates were stored", async () => {
  let calls = 0;
  const result = await discoverPublicResources({
    query: "csv processing",
    catalogs: ["github"],
    fetchImpl: async () => { calls += 1; return response({ message: "rate limit" }, 403); },
    submitCandidate: async () => { throw new Error("should not run"); }
  });
  assert.equal(calls, 1);
  assert.equal(result.discovered_count, 0);
  assert.equal(result.results[0].status, "unavailable");
  assert.equal(result.results[0].error, "catalog_http_403");
});

test("caps catalog results and rejects malformed inputs", async () => {
  const result = await discoverPublicResources({
    query: "image processing",
    catalogs: ["github"],
    limitPerCatalog: 1,
    fetchImpl: async () => response({ items: [
      { full_name: "one/repo", description: "one" },
      { full_name: "two/repo", description: "two" }
    ] })
  });
  assert.equal(result.results[0].count, 1);
  await assert.rejects(() => discoverPublicResources({ query: "ab" }), /at least 3/);
  await assert.rejects(() => discoverPublicResources({ query: "test", catalogs: ["github", "github"] }), /supported public catalogs/);
  await assert.rejects(() => discoverPublicResources({ query: "test", limitPerCatalog: 4 }), /between 1 and 3/);
});

test("does not accept malformed upstream repository, model, or package identifiers", async () => {
  const responses = [
    { host: "github", payload: { items: [{ full_name: "https://evil.example/path", description: "x" }] } },
    { host: "huggingface", payload: [{ modelId: "https://evil.example/model" }] },
    { host: "npm", payload: { objects: [{ package: { name: "../../evil" } }] } }
  ];
  for (const item of responses) {
    const result = await discoverPublicResources({
      query: "safe query",
      catalogs: [item.host],
      fetchImpl: async () => response(item.payload)
    });
    assert.equal(result.discovered_count, 0);
  }
});

test("keeps storage failures distinct from successful quarantine submissions", async () => {
  const result = await discoverPublicResources({
    query: "test library",
    catalogs: ["github"],
    fetchImpl: async () => response({ items: [{ full_name: "owner/tool" }] }),
    submitCandidate: async () => { throw new Error("memory unavailable"); }
  });
  assert.equal(result.discovered_count, 1);
  assert.equal(result.stored_quarantined_count, 0);
  assert.equal(result.results[0].candidates[0].storage_result, "storage_failed");
});

test("does not mistake GitHub NOASSERTION for a known license", async () => {
  const result = await discoverPublicResources({
    query: "resource search",
    catalogs: ["github"],
    fetchImpl: async () => response({ items: [{ full_name: "owner/unlicensed", license: { spdx_id: "NOASSERTION" } }] })
  });
  assert.equal(result.results[0].candidates[0].license, "unknown");
  assert.equal(result.results[0].candidates[0].commercial_use, "unknown");
});
