const API_ROOT = "https://api.github.com/repos/molson835-ai/Autonomous-dev-AI";
const API_HOST = "api.github.com";
const BRANCH_PREFIX = "eve/ebay-inventory-audit/";
const PRODUCT_PATH = "products/ebay-inventory-audit/";
const MAX_FILE_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 1_000_000;
const TIMEOUT_MS = 10_000;
const ALLOWED_EXTENSIONS = new Set([".html", ".mjs", ".js", ".css", ".json", ".md", ".csv", ".txt", ".svg"]);

class WriteError extends Error {
  constructor(code, status = null) { super(code); this.code = code; this.status = status; }
}

function validateBranch(branch) {
  if (typeof branch !== "string" || branch.length > 100 ||
      !new RegExp("^" + BRANCH_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[a-z0-9][a-z0-9-]{0,39}$").test(branch)) {
    throw new WriteError("branch-outside-project-scope");
  }
  return branch;
}

function validatePath(path) {
  if (typeof path !== "string" || path.length > 240 || !path.startsWith(PRODUCT_PATH) ||
      path.includes("\\") || path.startsWith("/") ||
      path.split("/").some(part => !part || part === "." || part === ".." || part.toLowerCase() === ".git")) {
    throw new WriteError("path-outside-project-scope");
  }
  const filename = path.slice(path.lastIndexOf("/") + 1);
  const dot = filename.lastIndexOf(".");
  if (dot < 1 || !ALLOWED_EXTENSIONS.has(filename.slice(dot).toLowerCase())) {
    throw new WriteError("file-type-not-allowed");
  }
  return path;
}

async function boundedJson(response) {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) throw new WriteError("github-response-too-large");
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) throw new WriteError("github-response-too-large");
  try { return text ? JSON.parse(text) : {}; }
  catch { throw new WriteError("github-invalid-response"); }
}

async function request(token, path, { method = "GET", body } = {}, fetchImpl = fetch) {
  const url = new URL(API_ROOT + path);
  if (url.protocol !== "https:" || url.hostname !== API_HOST) throw new WriteError("blocked-api-host");
  let response;
  try {
    response = await fetchImpl(url.toString(), {
      method, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        accept: "application/vnd.github+json",
        authorization: "Bearer " + token,
        "x-github-api-version": "2022-11-28",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    const name = error && typeof error === "object" ? error.name : "";
    throw new WriteError(name === "TimeoutError" || name === "AbortError" ? "github-timeout" : "github-network-error");
  }
  const payload = await boundedJson(response);
  if (!response.ok) {
    const code = response.status === 409 || response.status === 422 ? "github-conflict-or-validation" :
      response.status === 401 || response.status === 403 ? "github-auth-or-permission-denied" :
      response.status === 404 ? "github-resource-not-found" : "github-request-failed";
    throw new WriteError(code, response.status);
  }
  return payload;
}

function tokenOrThrow(token) {
  if (typeof token !== "string" || token.length < 20 || token.length > 500) throw new WriteError("repository-write-token-not-configured");
  return token;
}

function validSha(sha) { return typeof sha === "string" && /^[a-f0-9]{40}$/i.test(sha); }

async function createBranch(input, token, fetchImpl) {
  const branch = validateBranch(input.branchName);
  if (!validSha(input.expectedBaseSha)) throw new WriteError("invalid-expected-base-sha");
  const main = await request(token, "/git/ref/heads/main", {}, fetchImpl);
  if (main.object?.sha !== input.expectedBaseSha) throw new WriteError("base-branch-moved");
  await request(token, "/git/refs", { method: "POST", body: {
    ref: "refs/heads/" + branch, sha: input.expectedBaseSha,
  } }, fetchImpl);
  return { status: "branch_created", branch, base: "main", baseSha: input.expectedBaseSha };
}

async function writeFile(input, token, fetchImpl) {
  const branch = validateBranch(input.branchName);
  const path = validatePath(input.path);
  if (!validSha(input.expectedHeadSha)) throw new WriteError("invalid-expected-head-sha");
  if (typeof input.content !== "string" || input.content.length === 0 ||
      new TextEncoder().encode(input.content).byteLength > MAX_FILE_BYTES || input.content.includes("\u0000")) {
    throw new WriteError("file-content-limit-or-invalid");
  }
  const message = typeof input.message === "string" ? input.message.trim().slice(0, 120) : "";
  if (message.length < 5) throw new WriteError("commit-message-required");

  const refPath = "/git/ref/heads/" + branch.split("/").map(encodeURIComponent).join("/");
  const ref = await request(token, refPath, {}, fetchImpl);
  if (ref.object?.sha !== input.expectedHeadSha) throw new WriteError("branch-head-moved");
  const parent = await request(token, "/git/commits/" + input.expectedHeadSha, {}, fetchImpl);
  if (!validSha(parent.tree?.sha)) throw new WriteError("branch-tree-unavailable");

  const blob = await request(token, "/git/blobs", { method: "POST", body: {
    content: input.content, encoding: "utf-8",
  } }, fetchImpl);
  if (!validSha(blob.sha)) throw new WriteError("blob-create-failed");

  const tree = await request(token, "/git/trees", { method: "POST", body: {
    base_tree: parent.tree.sha,
    tree: [{ path, mode: "100644", type: "blob", sha: blob.sha }],
  } }, fetchImpl);
  if (!validSha(tree.sha)) throw new WriteError("tree-create-failed");

  const commit = await request(token, "/git/commits", { method: "POST", body: {
    message, tree: tree.sha, parents: [input.expectedHeadSha],
  } }, fetchImpl);
  if (!validSha(commit.sha)) throw new WriteError("commit-create-failed");

  // Non-force ref update only accepts a fast-forward. A concurrent branch update
  // makes this commit non-fast-forward and prevents overwriting the newer head.
  await request(token, refPath, { method: "PATCH", body: { sha: commit.sha, force: false } }, fetchImpl);
  return { status: "file_committed", branch, path, previousHeadSha: input.expectedHeadSha, commitSha: commit.sha };
}

async function openPullRequest(input, token, fetchImpl) {
  const branch = validateBranch(input.branchName);
  if (!validSha(input.expectedHeadSha)) throw new WriteError("invalid-expected-head-sha");
  const refPath = "/git/ref/heads/" + branch.split("/").map(encodeURIComponent).join("/");
  const ref = await request(token, refPath, {}, fetchImpl);
  if (ref.object?.sha !== input.expectedHeadSha) throw new WriteError("branch-head-moved");

  const compare = await request(token, "/compare/main..." + branch.split("/").map(encodeURIComponent).join("/"), {}, fetchImpl);
  if (!Array.isArray(compare.files) || compare.files.length === 0) throw new WriteError("no-verifiable-project-changes");
  if (compare.files.length >= 300 || compare.files.some(file =>
    typeof file.filename !== "string" || !file.filename.startsWith(PRODUCT_PATH) ||
    file.filename.includes("\\") || file.filename.split("/").some(part => part === ".." || part === ".git")
  )) throw new WriteError("pull-request-diff-outside-project-scope");
  if (compare.merge_base_commit?.sha === input.expectedHeadSha) throw new WriteError("no-branch-changes");

  const title = typeof input.title === "string" ? input.title.trim().slice(0, 120) : "";
  const body = typeof input.body === "string" ? input.body.trim().slice(0, 5000) : "";
  if (title.length < 5) throw new WriteError("pull-request-title-required");
  const pr = await request(token, "/pulls", { method: "POST", body: {
    title, body, head: branch, base: "main", draft: true, maintainer_can_modify: false,
  } }, fetchImpl);
  return { status: "draft_pull_request_opened", number: pr.number, url: pr.html_url, branch, base: "main", draft: true };
}

export async function runEbayProjectWrite(input, token, fetchImpl = fetch) {
  try {
    const credential = tokenOrThrow(token);
    if (!input || !["create_branch", "write_file", "open_pull_request"].includes(input.action)) {
      throw new WriteError("unsupported-action");
    }
    if (input.action === "create_branch") return await createBranch(input, credential, fetchImpl);
    if (input.action === "write_file") return await writeFile(input, credential, fetchImpl);
    return await openPullRequest(input, credential, fetchImpl);
  } catch (error) {
    return {
      error: error instanceof WriteError ? error.code : "repository-write-failed",
      ...(error instanceof WriteError && error.status ? { httpStatus: error.status } : {}),
    };
  }
}

export const EBayProjectWritePolicy = Object.freeze({
  repository: "molson835-ai/Autonomous-dev-AI",
  branchPrefix: BRANCH_PREFIX,
  productPath: PRODUCT_PATH,
  maxFileBytes: MAX_FILE_BYTES,
  maxResponseBytes: MAX_RESPONSE_BYTES,
  timeoutMs: TIMEOUT_MS,
  allowedExtensions: [...ALLOWED_EXTENSIONS],
});
