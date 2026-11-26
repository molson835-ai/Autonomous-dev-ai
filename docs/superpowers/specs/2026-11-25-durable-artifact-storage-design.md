# Bounded durable artifact storage

## Purpose
Replace the current create_artifact preview-only behavior with a small durable artifact library so Eve can save verified deliverables and retrieve them across sessions. First release: validated standalone HTML documents up to 64 KiB.

## Existing architecture
- Eve create_artifact validates HTML and returns preview/download content, but does not persist it.
- Cloudflare Worker hosts one SQLite-backed Durable Object for tasks, experiences, memories, quotas, and quarantined resource metadata.
- Eve-to-Worker requests use the app bearer token; owner routes use GitHub owner authentication through the Vercel proxy.
- Worker global JSON body parser is capped at 16 KB, insufficient for 64 KiB artifacts. Use a dedicated streaming byte-limited parser; do not raise the global cap.
- Vercel owner proxy currently has explicit route allowlists and a 16 KB POST cap. Artifact listing/download should use owner-authenticated GET routes.

## Goals
- Persist only validated, self-contained HTML artifacts produced by the existing artifact policy.
- Provide exact-ID read-back for Eve and owner listing/download through GitHub-authenticated Owner Console routes.
- Use opaque IDs and idempotency keys; never overwrite an existing artifact.
- Preserve filename, media type, byte length, SHA-256 hash, creation timestamp, optional source task ID, and validation version.
- Keep content inert as stored bytes. Do not execute or inline-render content in Worker or Owner Console API.
- Enforce strict per-artifact, total-count, and aggregate-storage limits.
- Keep artifact API separate from memories/experiences; do not store raw documents as memory records.

## Proposed initial limits
- One artifact per write call; HTML only; maximum 64 KiB UTF-8 content.
- Maximum 100 retained artifacts and 5 MiB aggregate content; reject writes rather than evict existing records.
- List at most 20 metadata records per page.
- Retrieve exact ID only; no arbitrary SQL/search filters.
- Opaque UUID IDs; unique idempotency key bounded to 200 characters.
- No public URLs, external assets, scripts, remote fetches, macros, or arbitrary binary uploads.
- No delete or overwrite route in initial version.

## API proposal
- Eve POST /v1/artifacts: app bearer authentication; exact schema, size, content hash, idempotency; insert new row.
- Eve GET /v1/artifacts/:id: app bearer authentication; exact-ID retrieval with immutable metadata.
- Owner GET /v1/owner/artifacts?limit=...: GitHub owner authentication; metadata only.
- Owner GET /v1/owner/artifacts/:id: GitHub owner authentication; content as attachment with no-store and safe headers via Vercel proxy.

Add paths explicitly to Worker owner-route classification and Vercel proxy allowlist. Owner proxy must enforce a response-size cap and never forward caller-controlled upstream URLs.

## Security
- Never expose MEMORY_API_TOKEN to Eve model context or browser.
- Eve writes remain gated by existing canUseWriteTools; no new bypass.
- Owner reads pass existing GitHub owner verification.
- No unauthenticated route; no CORS expansion beyond existing owner origin.
- Reject unexpected fields, invalid UTF-8/empty content, invalid IDs, malformed JSON, and over-limit bodies.
- Verify SHA-256 on write and read; fail closed on mismatch.
- Use parameterized SQL and INSERT only; unique idempotency key; 409 on conflicting duplicate.
- Do not evict old artifacts automatically or modify task/memory/resource records.
- Owner downloads are attachments, not inline HTML, to avoid executing user HTML on app origin.
- No-store responses; never log artifact content or secrets.

## Non-goals
General filesystem access, arbitrary binary uploads, public hosting, sharing links, customer delivery, publishing, deployment, artifact execution, automatic deletion, overwriting, external sync, R2 setup, paid services, task claims, memory writes, or production testing.

## Verification
Tests must prove auth separation, HTML validation, exact 64 KiB boundary, aggregate/count limits without eviction, idempotency, exact-ID retrieval, hash integrity, attachment download headers, and Vercel proxy allowlists. CI is the gate. Production storage and live round-trip testing require separate explicit owner approval after merge and deployment.
