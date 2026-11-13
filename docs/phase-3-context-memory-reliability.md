# Phase 3 — conversation context and persistent learning reliability

## Goal

Make the distinction between active-session context and cross-session persistent memory explicit, and verify the existing memory service's retrieval and approval boundaries in an isolated Worker runtime.

This phase does not add transcript access across chats. It does not change model weights, approve memories, rewrite stored records, or expand the agent's external permissions.

## Current architecture facts

- Eve sessions are the active conversation surface. The agent should use messages actually present in its active session.
- Persistent memory is a separate Cloudflare Worker backed by a SQLite Durable Object.
- Approved memories are retrieved from `/v1/recall`; pending proposals are listed separately from `/v1/proposals`.
- Experiences can be retrieved by exact `external_id`.
- The memory Worker requires its configured bearer token. Missing configuration or request failures must not be described as an empty successful recall.
- A new chat does not imply access to the full transcript of an older chat. Cross-session continuity depends on a successfully retrieved approved memory or experience.

## Acceptance criteria

1. A fact pack present in the current user message is treated as available context; Eve must not ask the user to repeat it.
2. Eve distinguishes active-session messages from older chat transcripts and does not claim cross-chat transcript access.
3. An approved memory is returned by keyword recall.
4. A pending proposal is listed for review but is absent from approved recall.
5. An explicitly approved proposal becomes eligible for approved recall.
6. A rejected proposal remains absent from approved recall.
7. An experience with a supplied external identifier is retrievable by exact match only.
8. Experiences with result values `success`, `failure`, and `partial` can each be stored and retrieved.
9. A duplicate external identifier cannot overwrite the original experience.
10. Schema migration adds the nullable external identifier without changing existing experience rows.
11. Memory service configuration, timeout, authentication, and server errors are distinguished from a successful empty result.
12. No memory is silently approved, rewritten, or deleted; no personal financial data, credentials, or sensitive personal data is added.

## Verification performed by automated tests

The Worker integration suite uses a local isolated Cloudflare runtime and a test-only credential. It never contacts or modifies the deployed Worker. Tests cover the HTTP contract for exact-ID retrieval, duplicate protection, proposal/approval separation, and all three experience result states.

The Node schema tests use an in-memory SQLite database to verify idempotent migration, preservation of a pre-existing row, exact identifier lookup, uniqueness, and allowed result states.

## Manual Eve evaluation still required

Automated Worker tests cannot prove model behavior or Eve session-context delivery. A controlled live evaluation must be performed in one Eve chat with the complete fact pack included in the same user message. Ask Eve to extract the facts verbatim and build the requested matrix. Then separately verify exact-ID persistent recall in a genuinely new Eve chat, using a record that was previously saved and whose write response was confirmed.

Record the prompt, raw output, tool result, and independent assessment. A model self-score is not certification. Until a reviewer verifies the live results, session-context handling and persistent learning remain unproven at the model/runtime level.

## Explicit non-goals

- No cross-chat transcript search or import.
- No automatic learning approval or skill promotion.
- No memory-record migration beyond the already implemented additive nullable column.
- No new paid services, billing, purchases, customer contact, payment processing, or Production deployment.
- No changes to Coastline.

## Live deployment gate — required before Phase 3 can pass

The repository implementation already includes the nullable `experiences.external_id` schema migration, a unique partial index, the `POST /v1/experiences` write response containing `external_id`, and the exact-match `GET /v1/experiences?external_id=...` endpoint. The isolated Worker tests verify these code paths. Do not describe these source files as absent from the repository.

A green local Worker test does **not** prove that the deployed Cloudflare Worker is running the same source revision. The CI workflow intentionally bundles and tests the Worker without deploying it. The November 12 live Eve test reported a write response containing only `id` and `stored`, followed by a 404 on exact-ID recall. That is evidence of a live code/configuration mismatch, but the 404 alone does not establish whether the deployed Worker is old or Eve is configured with a different base URL.

Before marking live persistent recall as passed:

1. Confirm Eve's configured `MEMORY_API_URL` points to the intended `autonomous-dev-memory` Worker. Never print or expose `MEMORY_API_TOKEN`.
2. Obtain explicit owner approval before deploying a Worker version to Production. No PR merge or CI run should implicitly deploy it.
3. After an approved deployment, create a **new** unique external ID. Confirm the write response includes that exact `external_id` and `stored: true`.
4. In a genuinely new Eve session, retrieve that exact ID. Confirm the returned record's external ID, task, outcome, and result match the write.
5. If either response is missing or erroneous, report the observed HTTP status and response shape. Do not retry an existing external ID as a new write; duplicate IDs are intentionally rejected. Do not delete or rewrite existing records.

Until these live checks pass, report Phase 3 as **automated tests passed; live deployment/recall pending or failed**. The current 404 test remains a failure, not a successful acceptance result.

