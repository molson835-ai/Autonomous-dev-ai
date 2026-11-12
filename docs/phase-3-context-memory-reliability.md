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
