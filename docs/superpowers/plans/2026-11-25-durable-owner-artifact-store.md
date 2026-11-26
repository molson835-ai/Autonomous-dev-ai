# Durable Owner-Visible Artifact Store Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Persist validated Eve HTML artifacts in the existing Durable Object and expose owner-only download/management plus agent read-back.

**Architecture:** Add an additive SQLite table and bounded Worker routes. Keep agent writes behind the current dynamic write-tool gate, expose agent reads as a static tool, and extend the existing GitHub-owner-authenticated proxy and console.

**Tech Stack:** Cloudflare Durable Objects SQLite, TypeScript, Next.js App Router, React, Vitest.

**Spec:** docs/superpowers/specs/2026-11-25-durable-owner-artifact-store-design.md

## Global Constraints

- 64 KiB maximum original HTML per artifact.
- 20 stored artifacts maximum and 1 MiB aggregate content maximum.
- Revalidate every write with the existing HTML artifact validator.
- Keep the default 16 KiB Worker request-body limit for all non-artifact routes.
- Agent writes require the existing canUseWriteTools gate.
- Owner reads/deletes require GitHub owner verification and same-origin proxy access.
- No new dependencies, external storage, public URLs, deployments, or task execution.

## Review Focus

- Oversized JSON must be rejected before parsing/storage.
- Agent write routes must remain inaccessible when the shared memory token is missing or invalid.
- Owner routes must reject non-owner credentials and must never appear in public CORS.
- Stored content must be the validator-produced CSP-injected HTML, not unvalidated input.
- Aggregate-cap and item-cap checks must be enforced before insertion and must not overwrite existing rows.

---

### Task 1: Add Worker integration tests

**Files:**
- Modify: memory/worker/test/worker.test.ts

**Interfaces:**
- Produces the API contract for POST /v1/artifacts, GET /v1/artifacts/:uuid, GET /v1/owner/artifacts, GET /v1/owner/artifacts/:uuid, and POST /v1/owner/artifacts/:uuid/delete.

- [ ] Add tests for validated persistence, agent read-back, owner list/detail/delete, invalid HTML, non-owner denial, and storage caps.
- [ ] Run Worker Vitest suite and confirm expected failures for missing routes.

### Task 2: Implement Durable Object storage and agent tools

**Files:**
- Modify: memory/worker/src/index.ts
- Modify: agent/tools/create_artifact.ts
- Create: agent/tools/get_artifact.ts
- Modify: agent/lib/runtime-diagnostics.mjs
- Test: memory/worker/test/worker.test.ts

**Interfaces:**
- POST /v1/artifacts accepts {name, content}; returns artifact metadata and UUID.
- GET /v1/artifacts/:uuid returns stored artifact content to the authenticated agent service.
- GET /v1/owner/artifacts returns metadata only.
- GET /v1/owner/artifacts/:uuid returns owner-download content.
- POST /v1/owner/artifacts/:uuid/delete deletes only the exact UUID after owner authorization.

- [ ] Add artifacts table and indexes without changing existing tables.
- [ ] Add a route-specific 96 KiB body limit for artifact creation.
- [ ] Validate HTML at the Worker boundary, enforce 64 KiB/20-item/1 MiB caps, and persist CSP-injected HTML.
- [ ] Make create_artifact persist after validation and return the durable artifact ID.
- [ ] Add read-only get_artifact with UUID input validation.
- [ ] Add get_artifact to the source-defined tool inventory.
- [ ] Run Worker Vitest suite, npm test, typecheck, and Eve build.

### Task 3: Add owner-only artifact management UI

**Files:**
- Modify: apps/web/app/api/owner/[...path]/route.ts
- Modify: apps/web/app/owner/owner-console.tsx
- Test: existing CI Next.js type-check and build.

- [ ] Allowlist only owner artifact list/detail/delete paths in the proxy.
- [ ] Add artifact metadata state and load it through the existing owner-authenticated proxy.
- [ ] Add owner-triggered download of artifact content.
- [ ] Add an explicit confirmation before deletion.
- [ ] Ensure sign-out clears artifact metadata.
- [ ] Run type-check and full CI.

## Deployment boundary

No merge, Vercel deployment, Cloudflare Worker deployment, Eve restart, task claim, model call, or Production data write is part of this plan.
