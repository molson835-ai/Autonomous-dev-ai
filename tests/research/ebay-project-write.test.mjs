import test from "node:test";
import assert from "node:assert/strict";
import { runEbayProjectWrite, EBayProjectWritePolicy } from "../../agent/lib/ebay-project-write.mjs";

const SHA = "a".repeat(40);
const TREE = "b".repeat(40);
const BLOB = "c".repeat(40);
const NEW_TREE = "d".repeat(40);
const COMMIT = "e".repeat(40);
const BRANCH = "eve/ebay-inventory-audit/first-build";

function response(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function mockFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    assert.equal(new URL(url).hostname, "api.github.com");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.authorization, "Bearer test-token");
    return handler(String(url), options);
  };
  return { fetchImpl, calls };
}

test("policy fixes the repository, project path, branch prefix, and small text-file bounds", () => {
  assert.equal(EBayProjectWritePolicy.repository, "molson835-ai/Autonomous-dev-AI");
  assert.equal(EBayProjectWritePolicy.productPath, "products/ebay-inventory-audit/");
  assert.equal(EBayProjectWritePolicy.branchPrefix, "eve/ebay-inventory-audit/");
  assert.equal(EBayProjectWritePolicy.maxFileBytes, 64 * 1024);
});

test("missing credential fails closed without making a network request", async () => {
  let calls = 0;
  const result = await runEbayProjectWrite({
    action: "create_branch", branchName: BRANCH, expectedBaseSha: SHA,
  }, undefined, async () => { calls += 1; });
  assert.equal(result.error, "repository-write-token-not-configured");
  assert.equal(calls, 0);
});

test("branch creation only accepts the dedicated prefix and exact current main SHA", async () => {
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls += 1;
    if (url.endsWith("/git/ref/heads/main")) return response({ object: { sha: SHA } });
    if (url.endsWith("/git/refs")) {
      const body = JSON.parse(options.body);
      assert.equal(body.ref, "refs/heads/" + BRANCH);
      assert.equal(body.sha, SHA);
      return response({ ref: body.ref });
    }
    throw new Error("unexpected endpoint");
  };
  const ok = await runEbayProjectWrite({
    action: "create_branch", branchName: BRANCH, expectedBaseSha: SHA,
  }, "test-token", fetchImpl);
  assert.equal(ok.status, "branch_created");
  assert.equal(calls, 2);

  const bad = await runEbayProjectWrite({
    action: "create_branch", branchName: "feature/unrestricted", expectedBaseSha: SHA,
  }, "test-token", async () => { throw new Error("must not fetch"); });
  assert.equal(bad.error, "branch-outside-project-scope");

  const stale = await runEbayProjectWrite({
    action: "create_branch", branchName: BRANCH, expectedBaseSha: "f".repeat(40),
  }, "test-token", async () => response({ object: { sha: SHA } }));
  assert.equal(stale.error, "base-branch-moved");
});

test("writes reject paths outside the product and path traversal before network access", async () => {
  for (const path of [
    "README.md",
    "products/other-project/index.html",
    "products/ebay-inventory-audit/../README.md",
    "products/ebay-inventory-audit/.git/config",
    "products/ebay-inventory-audit/binary.exe",
  ]) {
    const result = await runEbayProjectWrite({
      action: "write_file", branchName: BRANCH, path, content: "x",
      message: "test update", expectedHeadSha: SHA,
    }, "test-token", async () => { throw new Error("must not fetch"); });
    assert.ok(result.error, path);
  }
});

test("file write uses expected head, Git Data API, and a non-force ref update", async () => {
  const { fetchImpl, calls } = mockFetch((url, options) => {
    if (url.endsWith("/git/ref/heads/" + BRANCH) && options.method === "GET") return response({ object: { sha: SHA } });
    if (url.endsWith("/git/commits/" + SHA)) return response({ tree: { sha: TREE } });
    if (url.endsWith("/git/blobs")) {
      const body = JSON.parse(options.body);
      assert.equal(body.encoding, "utf-8");
      assert.equal(body.content, "<h1>Local audit</h1>");
      return response({ sha: BLOB }, 201);
    }
    if (url.endsWith("/git/trees")) {
      const body = JSON.parse(options.body);
      assert.equal(body.base_tree, TREE);
      assert.equal(body.tree[0].path, "products/ebay-inventory-audit/index.html");
      assert.equal(body.tree[0].sha, BLOB);
      return response({ sha: NEW_TREE }, 201);
    }
    if (url.endsWith("/git/commits")) {
      const body = JSON.parse(options.body);
      assert.deepEqual(body.parents, [SHA]);
      assert.equal(body.tree, NEW_TREE);
      return response({ sha: COMMIT }, 201);
    }
    if (url.endsWith("/git/ref/heads/" + BRANCH) && options.method === "PATCH") {
      const body = JSON.parse(options.body);
      assert.equal(body.force, false);
      return response({ object: { sha: COMMIT } });
    }
    throw new Error("unexpected endpoint " + url);
  });
  const result = await runEbayProjectWrite({
    action: "write_file", branchName: BRANCH,
    path: "products/ebay-inventory-audit/index.html",
    content: "<h1>Local audit</h1>", message: "Improve local audit page",
    expectedHeadSha: SHA,
  }, "test-token", fetchImpl);
  assert.equal(result.status, "file_committed");
  assert.equal(result.commitSha, COMMIT);
  assert.equal(calls.length, 6);
  assert.ok(calls.every(call => call.options.headers.authorization === "Bearer test-token"));
});

test("stale branch head prevents any Git Data API writes", async () => {
  let writes = 0;
  const result = await runEbayProjectWrite({
    action: "write_file", branchName: BRANCH,
    path: "products/ebay-inventory-audit/index.html",
    content: "<h1>Test</h1>", message: "Update page",
    expectedHeadSha: SHA,
  }, "test-token", async (url, options) => {
    if (options.method !== "GET") writes += 1;
    return response({ object: { sha: "f".repeat(40) } });
  });
  assert.equal(result.error, "branch-head-moved");
  assert.equal(writes, 0);
});

test("pull request creation checks every changed path and opens a draft to main only", async () => {
  const { fetchImpl, calls } = mockFetch((url, options) => {
    if (url.endsWith("/git/ref/heads/" + BRANCH)) return response({ object: { sha: SHA } });
    if (url.includes("/compare/main...")) return response({
      ahead_by: 1,
      files: [{ filename: "products/ebay-inventory-audit/index.html" }],
    });
    if (url.endsWith("/pulls")) {
      const body = JSON.parse(options.body);
      assert.equal(body.base, "main");
      assert.equal(body.head, BRANCH);
      assert.equal(body.draft, true);
      assert.equal(body.maintainer_can_modify, false);
      return response({ number: 200, html_url: "https://github.com/molson835-ai/Autonomous-dev-AI/pull/200" }, 201);
    }
    throw new Error("unexpected endpoint");
  });
  const result = await runEbayProjectWrite({
    action: "open_pull_request", branchName: BRANCH, expectedHeadSha: SHA,
    title: "Improve eBay audit tool", body: "Implementation notes.",
  }, "test-token", fetchImpl);
  assert.equal(result.status, "draft_pull_request_opened");
  assert.equal(result.draft, true);
  assert.equal(calls.length, 3);

  const outside = await runEbayProjectWrite({
    action: "open_pull_request", branchName: BRANCH, expectedHeadSha: SHA,
    title: "Outside path change",
  }, "test-token", async (url, options) => {
    if (url.endsWith("/git/ref/heads/" + BRANCH)) return response({ object: { sha: SHA } });
    if (url.includes("/compare/main...")) return response({
      ahead_by: 1, files: [{ filename: "agent/agent.ts" }],
    });
    throw new Error("PR must not be created");
  });
  assert.equal(outside.error, "pull-request-diff-outside-project-scope");
});

test("PR creation fails closed when compare results are incomplete or have too many paths", async () => {
  const result = await runEbayProjectWrite({
    action: "open_pull_request", branchName: BRANCH, expectedHeadSha: SHA,
    title: "Open bounded draft",
  }, "test-token", async (url) => {
    if (url.endsWith("/git/ref/heads/" + BRANCH)) return response({ object: { sha: SHA } });
    return response({ ahead_by: 1, files: Array.from({ length: 300 }, () => ({ filename: "products/ebay-inventory-audit/a.csv" })) });
  });
  assert.equal(result.error, "pull-request-diff-outside-project-scope");
});
