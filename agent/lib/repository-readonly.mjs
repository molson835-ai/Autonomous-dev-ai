const API_ROOT = "https://api.github.com/repos/molson835-ai/Autonomous-dev-AI";
const API_HOST = "api.github.com";
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_TREE_ENTRIES = 500;
const MAX_FILE_BYTES = 64 * 1024;
const MAX_FILE_CHARS = 20_000;

export const REPOSITORY_READONLY_LIMITS = Object.freeze({
  maxFilesPerCall: 5,
  maxTreeEntries: MAX_TREE_ENTRIES,
  maxFileBytes: MAX_FILE_BYTES,
  maxFileChars: MAX_FILE_CHARS,
  maxResponseBytes: MAX_RESPONSE_BYTES,
  timeoutMs: REQUEST_TIMEOUT_MS,
});

class RepositoryReadError extends Error {
  constructor(code, status = null) {
    super(code);
    this.name = "RepositoryReadError";
    this.code = code;
    this.status = status;
  }
}

async function readBoundedText(response) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new RepositoryReadError("response-too-large");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (total + value.byteLength > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new RepositoryReadError("response-too-large");
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function getJson(path, fetchImpl) {
  const suffix = path ? (path.startsWith("/") ? path : `/${path}`) : "";\n  const url = new URL(`${API_ROOT}${suffix}`);
  if (url.protocol !== "https:" || url.hostname !== API_HOST || url.username || url.password) {
    throw new RepositoryReadError("blocked-url");
  }
  let response;
  try {
    response = await fetchImpl(url.toString(), {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
      },
    });
  } catch (error) {
    const name = error && typeof error === "object" ? error.name : "";
    throw new RepositoryReadError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network-error");
  }
  if (!response.ok) throw new RepositoryReadError(`github-http-${response.status}`, response.status);
  const contentType = response.headers.get("content-type") ?? "";
  if (!/application\\/(?:vnd\\.github\\+)?json/i.test(contentType)) {
    throw new RepositoryReadError("unexpected-content-type");
  }
  const text = await readBoundedText(response);
  try {
    return JSON.parse(text);
  } catch {
    throw new RepositoryReadError("invalid-json");
  }
}

function assertPublicRepository(repository) {
  if (!repository || repository.full_name?.toLowerCase() !== "molson835-ai/autonomous-dev-ai") {
    throw new RepositoryReadError("repository-identity-mismatch");
  }
  if (repository.private !== false || repository.visibility !== "public") {
    throw new RepositoryReadError("repository-not-public");
  }
  if (typeof repository.default_branch !== "string" || !repository.default_branch) {
    throw new RepositoryReadError("default-branch-unavailable");
  }
}

async function getHead(fetchImpl) {
  const repository = await getJson("", fetchImpl);
  assertPublicRepository(repository);
  const branch = encodeURIComponent(repository.default_branch);
  const commit = await getJson(`/commits/${branch}`, fetchImpl);
  const sha = commit?.sha;
  const treeSha = commit?.commit?.tree?.sha;
  if (typeof sha !== "string" || !/^[a-f0-9]{40}$/i.test(sha) ||
      typeof treeSha !== "string" || !/^[a-f0-9]{40}$/i.test(treeSha)) {
    throw new RepositoryReadError("head-commit-unavailable");
  }
  return { repository, commit, sha, treeSha };
}

function safeCommit(commit) {
  return {
    sha: commit.sha,
    message: String(commit.commit?.message ?? "").slice(0, 500),
    committedAt: commit.commit?.committer?.date ?? null,
    treeSha: commit.commit?.tree?.sha ?? null,
    parentShas: Array.isArray(commit.parents) ? commit.parents.slice(0, 4).map(parent => parent.sha) : [],
    url: commit.html_url ?? null,
  };
}

function validatePath(path) {
  if (typeof path !== "string" || path.length < 1 || path.length > 240 ||
      path.startsWith("/") || path.includes("\\") ||
      path.split("/").some(part => !part || part === "." || part === "..") ||
      path.split("/").some(part => part.toLowerCase() === ".git")) {
    throw new RepositoryReadError("invalid-repository-path");
  }
  return path;
}

async function readOneFile(path, sha, fetchImpl) {
  try {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const ref = encodeURIComponent(sha);
    const file = await getJson(`/contents/${encodedPath}?ref=${ref}`, fetchImpl);
    if (file.type !== "file" || file.encoding !== "base64" || typeof file.content !== "string") {
      return { path, error: "not-a-supported-text-file" };
    }
    const size = Number(file.size);
    if (!Number.isFinite(size) || size < 0 || size > MAX_FILE_BYTES) {
      return { path, size: Number.isFinite(size) ? size : null, error: "file-size-limit" };
    }
    const content = Buffer.from(file.content.replace(/\s/g, ""), "base64").toString("utf8");
    if (content.includes("\u0000")) return { path, size, error: "binary-file-not-supported" };
    return {
      path,
      sha: file.sha ?? null,
      size,
      content: content.slice(0, MAX_FILE_CHARS),
      truncated: content.length > MAX_FILE_CHARS,
      commitSha: sha,
    };
  } catch (error) {
    return {
      path,
      error: error instanceof RepositoryReadError ? error.code : "read-failed",
      ...(error instanceof RepositoryReadError && error.status ? { httpStatus: error.status } : {}),
    };
  }
}

export async function runRepositoryReadOnly(input, fetchImpl = fetch) {
  const action = input?.action;
  if (!["metadata", "tree", "read_files", "commit"].includes(action)) {
    throw new RepositoryReadError("unsupported-action");
  }

  if (action === "commit" && input.commitSha !== undefined &&
      (typeof input.commitSha !== "string" || !/^[a-f0-9]{40}$/i.test(input.commitSha))) {
    throw new RepositoryReadError("invalid-commit-sha");
  }

  if (action === "read_files") {
    if (!Array.isArray(input.paths) || input.paths.length < 1 || input.paths.length > 5) {
      throw new RepositoryReadError("file-count-limit");
    }
    input.paths.forEach(validatePath);
  }

  try {
    if (action === "commit" && input.commitSha) {
      const repository = await getJson("", fetchImpl);
      assertPublicRepository(repository);
      const commit = await getJson(`/commits/${encodeURIComponent(input.commitSha)}`, fetchImpl);
      return { repository: repository.full_name, commit: safeCommit(commit) };
    }

    const { repository, commit, sha, treeSha } = await getHead(fetchImpl);

    if (action === "metadata") {
      return {
        repository: repository.full_name,
        visibility: repository.visibility,
        defaultBranch: repository.default_branch,
        latestCommitSha: sha,
        latestCommitUrl: commit.html_url ?? null,
      };
    }

    if (action === "commit") {
      return { repository: repository.full_name, commit: safeCommit(commit) };
    }

    if (action === "read_files") {
      const files = [];
      for (const path of input.paths) files.push(await readOneFile(path, sha, fetchImpl));
      return { repository: repository.full_name, commitSha: sha, files };
    }

    const tree = await getJson(`/git/trees/${encodeURIComponent(treeSha)}?recursive=1`, fetchImpl);
    if (!Array.isArray(tree.tree)) throw new RepositoryReadError("tree-unavailable");
    return {
      repository: repository.full_name,
      commitSha: sha,
      treeSha,
      truncated: Boolean(tree.truncated) || tree.tree.length > MAX_TREE_ENTRIES,
      totalEntriesReported: tree.tree.length,
      entries: tree.tree.slice(0, MAX_TREE_ENTRIES).map(entry => ({
        path: entry.path,
        type: entry.type,
        ...(Number.isFinite(entry.size) ? { size: entry.size } : {}),
        sha: entry.sha,
      })),
    };
  } catch (error) {
    if (error instanceof RepositoryReadError) {
      return { error: error.code, ...(error.status ? { httpStatus: error.status } : {}) };
    }
    return { error: "repository-read-failed" };
  }
}
