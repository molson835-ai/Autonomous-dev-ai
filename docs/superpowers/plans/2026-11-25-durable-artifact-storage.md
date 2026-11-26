# Durable Artifact Storage Implementation Plan

Goal: Persist Eve's validated HTML deliverables in the existing Durable Object and provide authenticated read-back for Eve and owner.

Architecture: Add a bounded SQLite artifacts table to the existing MemoryStore. Eve writes remain behind app-token and existing dynamic-tool gates; owner listing/download remains behind GitHub owner authentication and explicit Vercel proxy routes. Store content as inert text, never inline-render it.

Spec: docs/superpowers/specs/2026-11-25-durable-artifact-storage-design.md

## Constraints
- HTML only, validated by existing artifact-policy.mjs.
- Max 64 KiB per artifact; 100 records; 5 MiB aggregate; reject on exhaustion, never silently evict.
- Opaque UUID IDs, idempotency key, immutable records, exact-ID retrieval.
- No public links, sharing, delete, overwrite, R2, external assets, or new dependencies.
- No Production writes, memory/task changes, deployment, or task execution.

## Task 1: Storage contract tests
- [ ] Add tests for schema migration, write/read, idempotency, validation, size and aggregate limits, metadata pagination, and hash mismatch.
- [ ] Run focused tests and confirm RED.

## Task 2: Durable Object storage routes
- [ ] Add artifact row type and idempotent table/index migration.
- [ ] Add dedicated bounded request-body reader capped at 70 KiB; do not change global readBody.
- [ ] Add app-authenticated POST /v1/artifacts and GET /v1/artifacts/:uuid.
- [ ] Validate exact fields, content size, HTML policy, SHA-256, idempotency; parameterize SQL.
- [ ] Enforce 100-record and 5 MiB aggregate limits transactionally; no eviction.
- [ ] Add GitHub-owner-authenticated GET /v1/owner/artifacts and GET /v1/owner/artifacts/:uuid; list metadata only, retrieve content as attachment.
- [ ] Add no-store headers and stable error codes.

## Task 3: Eve tools
- [ ] Modify create_artifact to validate then persist, only when canUseWriteTools permits the dynamic tool.
- [ ] Add read-only exact-ID get_artifact tool; cap content at 64 KiB.
- [ ] Never claim persistence before a 201 response and exact-ID read-back succeeds.
- [ ] Preserve existing preview payload shape for compatibility, but distinguish stored vs preview-only result.

## Task 4: Owner proxy
- [ ] Extend Vercel catch-all proxy GET allowlist for artifact list and exact-ID retrieval.
- [ ] Use strict UUID path validation; no caller-controlled upstream host or path segments.
- [ ] Add response-size bound and safe Content-Disposition attachment headers.
- [ ] Add tests for owner authentication, route allowlist, same-origin and size limits.

## Task 5: Verification and review
- [ ] Run focused tests, npm test, npm run typecheck, npm run build, and Worker-specific tests/build.
- [ ] Review migration idempotency, transaction semantics, auth separation, retention, and HTML download behavior.
- [ ] Open a separate draft PR; request owner review before merge.

No merge, deploy, Worker publish, task claim, Eve model call, production artifact write, memory write, queue change, paid provider, or outbound contact.
