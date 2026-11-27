# Eve read-only repository visibility

## Scope

Eve can inspect only the public repository `molson835-ai/Autonomous-dev-AI`. The tool does not use a GitHub token, OAuth grant, repository permission, Cloudflare secret, or user credential. The repository is verified public through GitHub repository metadata.

## Available operations

The `repository_readonly` tool supports:

- `metadata`: repository visibility, default branch, and latest default-branch commit SHA.
- `tree`: a recursive file tree pinned to the default-branch commit; output is capped at 500 entries.
- `read_files`: one to five repository-relative text files, each no larger than 64 KiB, read at the same commit SHA.
- `commit`: metadata for the latest commit or a supplied full commit SHA.

## Technical enforcement

- Repository owner/name and API hostname are constants in the implementation; callers cannot select another repository or host.
- Requests are HTTPS GET only, use `redirect: "error"`, and carry no Authorization header.
- No user-supplied URL, HTTP method, headers, query string, or API path is accepted.
- File paths are validated as relative paths; traversal segments, backslashes, empty segments, and `.git` paths are rejected.
- File reads are limited to five per call and pinned to the exact same commit SHA returned by the default-branch head lookup.
- API responses are limited to 1 MB, request timeouts to eight seconds, file size to 64 KiB, file text to 20,000 characters, and tree output to 500 entries.
- Errors return bounded reason codes and HTTP status only; raw response bodies and credentials are not returned.
- The tool is static and read-only; it is not included in the dynamic write-tool gate because it has no state-changing operation.

## Verification

Automated tests verify fixed-host GET-only behavior, absence of Authorization headers, SHA-pinned file reads, path traversal rejection, file-count limits, bounded tree output, and fail-closed behavior if the repository is not public.

The live acceptance test should call `metadata`, then `read_files` for `package.json` and `README.md`, and confirm both files report the same commit SHA as metadata. A successful tool call proves public repository read access only; it does not grant filesystem, shell, branch, commit, merge, or deployment capability.

## Rate limits and costs

Unauthenticated GitHub REST API requests are subject to GitHub's public API rate limits. The tool does not retry, authenticate, or fall back to another provider. Rate-limit responses are surfaced as an HTTP status and the caller should pause. No paid service or new credential is introduced.
