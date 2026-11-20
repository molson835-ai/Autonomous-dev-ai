# Eve Tool Workspace — policy gate (proposal-only stage)

## Purpose

Establish a narrow policy boundary before any repository-writing capability is considered. This stage validates a proposed list of **new text files**. It is not a sandbox, does not access a filesystem, and cannot write to GitHub.

## Current behavior

- Accepts at most five new files.
- Allows only paths under `agent/tools/`, `agent/lib/`, `agent/skills/`, `tests/`, and `docs/`.
- Rejects traversal, absolute paths, encoded paths, backslashes, duplicate paths, protected roots, and sensitive configuration filenames.
- Allows create-only proposals. Updating or deleting existing files is rejected.
- Limits each file to 32 KiB and the full proposal to 80 KiB.
- Rejects control characters commonly associated with binary content.
- Returns a small manifest and explicit capability limits.

## Deliberate non-capabilities

This policy helper does not establish that a path is unused in the target repository. It does not read or write files, apply patches, execute code, install packages, access network services, create commits, create branches, open pull requests, or deploy anything. A future writer must independently verify target-path nonexistence and enforce the same policy server-side.

## Required next stage before any writer exists

1. Threat-model the credential boundary and the GitHub API surface.
2. Run the writer in an isolated, short-lived workspace with no production credentials.
3. Permit only a dedicated feature branch and the same new-file allowlist.
4. Enforce file-count and byte limits again at the write boundary.
5. Never run generated code or package lifecycle scripts in the writer.
6. Produce a diff and CI evidence; open a draft PR only after validation.
7. Require owner review/approval before merge. Keep Production deployment separately gated.
8. Test traversal, symlink/path aliasing, race conditions, oversized content, secret leakage, prompt injection, and partial-write recovery.

The current helper is a deterministic policy check, not a security sandbox. Runtime isolation and credential restrictions remain unimplemented.
