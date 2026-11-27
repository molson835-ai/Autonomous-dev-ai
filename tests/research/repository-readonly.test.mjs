import test from "node:test";
import assert from "node:assert/strict";
import { runRepositoryReadOnly, REPOSITORY_READONLY_LIMITS } from "../agent/lib/repository-readonly.mjs";

const SHA = "a".repeat(40);
const TREE_SHA = "b".repeat(40);

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function mockFetch(routes, calls = []) {
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.equal(new URL(url).hostname, "api.github.com");
    assert.equal("authorization" in options.headers, false);
    const route = routes[String(url)];
    return route ?? jsonResponse({ message: "Not Found" }, 404);
  };
  return { fetchImpl, calls };
}

const repository = {
  full_name: "molson835-ai/Autonomous-dev-AI",
  private: false,
  visibility: "public",
  default_branch: "main",
};

const head = {
  sha: SHA,
  html_url: "https://github.com/molson835-ai/Autonomous-dev-ai/commit/" + SHA,
  commit: { tree: { sha: TREE_SHA }, message: "test head", committer: { date: "2026-11-27T00:00:00Z" } },
  parents: [],
};

test("metadata reports the public repository and pinned default-branch commit", async () => {
  const { fetchImpl, calls } = mockFetch({
    "https://api.github.com/repos/molson835-ai/Autonomous-dev-AI": jsonResponse(repository),
    "https://api.github.com/repos/molson835-ai/Autonomous-dev-AI/commits/main": jsonResponse(head),
  });
  const result = await runRepositoryReadOnly({ action: "metadata" }, fetchImpl);
  assert.equal(result.visibility, "public");
  assert.equal(result.defaultBranch, "main");
  assert.equal(result.latestCommitSha, SHA);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.options.method === "GET"));
});

test("file reads are limited, unauthenticated, and pinned to the same commit SHA", async () => {
  const calls = [];
  const encoded = Buffer.from("{\"name\":\"test\"}").toString("base64");
  const readme = Buffer.from("# Test README").toString("base64");
  const { fetchImpl } = mockFetch({
    "https://api.github.com/repos/molson835-ai/Autonomous-dev-AI": jsonResponse(repository),
    "https://api.github.com/repos/molson835-ai/Autonomous-dev-AI/commits/main": jsonResponse(head),
    [`https://api.github.com/repos/molson835-ai/Autonomous-dev-AI/contents/package.json?ref=${SHA}`]: jsonResponse({ type: "file", encoding: "base64", content: encoded, size: 15, sha: "c".repeat(40) }),
    [`https://api.github.com/repos/molson835-ai/Autonomous-dev-AI/contents/README.md?ref=${SHA}`]: jsonResponse({ type: "file", encoding: "base64", content: readme, size: 13, sha: "d".repeat(40) }),
  }, calls);
  const result = await runRepositoryReadOnly({ action: "read_files", paths: ["package.json", "README.md"] }, fetchImpl);
  assert.equal(result.commitSha, SHA);
  assert.deepEqual(result.files.map(file => file.content), ['{"name":"test"}', "# Test README"]);
  assert.ok(calls.every(call => call.options.method === "GET"));
  assert.ok(calls.every(call => !JSON.stringify(call.options.headers).toLowerCase().includes("authorization")));
});

test("path traversal and excessive file requests are rejected before network access", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; throw new Error("should not fetch"); };
  const traversal = await runRepositoryReadOnly({ action: "read_files", paths: ["../secrets.txt"] }, fetchImpl);
  assert.equal(traversal.error, "invalid-repository-path");
  const tooMany = await runRepositoryReadOnly({ action: "read_files", paths: Array(6).fill("README.md") }, fetchImpl);
  assert.equal(tooMany.error, "file-count-limit");
  assert.equal(calls, 0);
});

test("tree output is bounded and records truncation", async () => {
  const entries = Array.from({ length: REPOSITORY_READONLY_LIMITS.maxTreeEntries + 3 }, (_, index) => ({
    path: `file-${index}.txt`, type: "blob", sha: "e".repeat(40), size: 10,
  }));
  const { fetchImpl } = mockFetch({
    "https://api.github.com/repos/molson835-ai/Autonomous-dev-AI": jsonResponse(repository),
    "https://api.github.com/repos/molson835-ai/Autonomous-dev-AI/commits/main": jsonResponse(head),
    [`https://api.github.com/repos/molson835-ai/Autonomous-dev-AI/git/trees/${TREE_SHA}?recursive=1`]: jsonResponse({ tree: entries, truncated: false }),
  });
  const result = await runRepositoryReadOnly({ action: "tree" }, fetchImpl);
  assert.equal(result.entries.length, REPOSITORY_READONLY_LIMITS.maxTreeEntries);
  assert.equal(result.truncated, true);
});

test("private repositories fail closed", async () => {
  const { fetchImpl } = mockFetch({
    "https://api.github.com/repos/molson835-ai/Autonomous-dev-AI": jsonResponse({ ...repository, private: true, visibility: "private" }),
  });
  const result = await runRepositoryReadOnly({ action: "metadata" }, fetchImpl);
  assert.equal(result.error, "repository-not-public");
});
