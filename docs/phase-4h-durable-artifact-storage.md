# Phase 4H — durable owner-visible artifact storage

## Purpose

Preserve validated research reports and HTML product deliverables beyond a single tool response. Eve can retrieve saved artifacts by UUID; the verified owner can review, download, or explicitly delete them in the Owner Console.

## Storage and tools

- Uses the existing Cloudflare Durable Object SQLite store; no new service or dependency.
- create_artifact validates the HTML and persists through the existing shared Worker credential. The dynamic tool remains behind canUseWriteTools.
- get_artifact is read-only and retrieves one stored artifact by UUID.
- Worker validates every write again and stores only the validator-produced CSP-injected HTML.
- Owner routes list metadata, retrieve full content for download, and delete one exact UUID. They are protected by GitHub owner verification and the same-origin Vercel proxy.
- Limits: 64 KiB original HTML per artifact, 20 stored artifacts, and 1 MiB aggregate stored content. Oversized request bodies are rejected while streaming.
- Every create request includes a UUID idempotency key. Retrying the same key with identical name/content returns the original artifact; reusing the key with different content returns HTTP 409.
- The exact CSP-injected HTML is SHA-256 hashed. Agent and owner detail reads recompute and verify the hash before returning content; a mismatch fails closed. Legacy rows without a hash are hashed on first successful read.
- No public artifact links, filesystem access, arbitrary uploads, binary files, or code execution by the Worker.

## Owner experience

The Owner Console lists stored artifacts with name, filename, size, creation time, and UUID. Download is owner-authenticated. Delete requires an explicit browser confirmation. If the Vercel UI deploys before the Worker update, the artifact section reports that storage is unavailable while other Owner Console functions continue to work.

## Verification boundary

Worker integration tests cover persistence, agent read-back and SHA-256 verification, identical idempotent retries, conflicting key reuse, owner-only listing/download/delete, invalid HTML, request bounds, item caps, and aggregate storage limits. CI type-checks the Owner Console and agent tools. Deployment of the Vercel app and Worker is separately gated; this feature does not authorize either deployment or any Eve task run.
