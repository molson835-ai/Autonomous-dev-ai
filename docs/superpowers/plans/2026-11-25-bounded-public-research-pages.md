# Bounded Public Research Pages Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add a read-only Eve tool that retrieves bounded excerpts from explicitly allowlisted public business-research pages.

**Architecture:** Reuse the existing source fetcher and parsing pipeline with a separate fixed hostname allowlist. Add a small authored static tool and tests; do not change the technical documentation tool's host policy.

**Tech Stack:** TypeScript, Node test runner, existing Eve tool API, existing fetch helpers.

**Spec:** docs/superpowers/specs/2026-11-25-bounded-public-research-pages-design.md

## Global Constraints

- Maximum five URLs per call.
- HTTPS only; no URL credentials or explicit ports.
- Exact hostname allowlist; every redirect is revalidated.
- Eight-second timeout, one-megabyte response cap, eight-thousand-character excerpt cap.
- No new dependencies, API keys, paid providers, memory writes, task changes, or deployment.

## Review Focus

- Redirects to an unapproved hostname must be rejected before the redirected request is sent.
- URL credentials, non-default ports, IP literals, and non-HTTPS schemes must fail closed.
- Oversized response bodies must be cancelled at the byte limit and marked truncated.
- Non-HTML/non-plain-text responses must not be interpreted as page text.
- Retrieved text must be labeled untrusted and never described as verified demand or revenue evidence.

---

### Task 1: Add allowlisted public-page retrieval tests

**Files:**
- Create: tests/research/public-research-pages.test.mjs
- Modify: none

**Interfaces:**
- Consumes: existing fetchResearchSources behavior as baseline.
- Produces: test contract for fetchPublicResearchPages(sourceUrls, topic, fetchImpl?).

- [ ] Step 1: Write tests for approved host retrieval, rejection of unapproved/unsafe URLs, redirect revalidation, response type rejection, excerpt extraction, and byte truncation.
- [ ] Step 2: Run focused test with node --test tests/research/public-research-pages.test.mjs.
- [ ] Step 3: Confirm expected RED because the new export does not exist.
- [ ] Step 4: Commit tests.

### Task 2: Implement shared allowlist-aware retrieval and Eve tool

**Files:**
- Modify: agent/research/sources.ts
- Create: agent/tools/research_public_pages.ts
- Modify: agent/instructions.md
- Modify: docs/eve-runtime-capability-inventory.md
- Create: docs/phase-4g-public-research-pages.md
- Test: tests/research/public-research-pages.test.mjs

**Interfaces:**
- Consumes: Task 1 test contract.
- Produces: fetchPublicResearchPages(sourceUrls: string[], topic: string, fetchImpl?: typeof fetch) and read-only static tool research_public_pages.

- [ ] Step 1: Add separate fixed allowlist without changing APPROVED_RESEARCH_HOSTS.
- [ ] Step 2: Parameterize internal URL validation/fetch so all redirects are revalidated against the selected allowlist.
- [ ] Step 3: Export bounded public-page retrieval with at most five distinct supplied URLs.
- [ ] Step 4: Add static read-only Eve tool with exact input bounds and explicit untrusted-content warnings.
- [ ] Step 5: Document capability and limitations in instructions, runtime inventory, and phase doc.
- [ ] Step 6: Run focused tests with node --test tests/research/public-research-pages.test.mjs.
- [ ] Step 7: Run full test suite with npm test, type-check with npm run typecheck, and build with npm run build.
- [ ] Step 8: Review diff and CI results before requesting merge approval.

## Deployment boundary

No merge, deployment, Worker publish, Eve restart, task claim, model call, memory write, quota change, or outbound contact is part of this plan.
