# Historical pull-request preservation audit

Audit date: 2026-11-15. Repository: `molson835-ai/Autonomous-dev-ai`.

This ledger distinguishes merged work, superseded work, and intentionally temporary investigations. A closed, unmerged PR is not automatically considered lost: its successor must be checked for the actual implementation.

## Closed, unmerged PRs with important work

| Historical PR | Work | Disposition |
|---|---|---|
| #6 — Private owner sign-in | Owner-only chat sign-in and fail-closed route authentication | Superseded by the combined integration PR #8, which merged. The later auth evolution is represented by merged PRs #13, #17, and #33. Do not restore the old sign-in implementation without reviewing the later auth decisions. |
| #7 — Phase 1 read-only research engine | Allowlisted HTTPS retrieval, redirect revalidation, size/time/content-type limits, untrusted-evidence handling, and tests | Combined with the owner sign-in work in PR #8, which merged. Later bounded public research is also in merged PR #28; keyless GDELT discovery is active in PR #36. |
| #9 — Persistent learning and memory foundation | Authenticated Cloudflare Worker, Durable Object memory, experience/proposal/approved-memory separation, tools, and policy tests | Duplicate/earlier version of PR #10, which merged. Exact external IDs and cross-session reliability were subsequently merged in PRs #11 and #16. |
| #12 — Anonymous Preview access | Preview-only anonymous chat while retaining Production protection | Superseded by PR #13, which merged. Later public-chat change PR #17 and GitHub owner sign-in PR #33 also merged; preserve the current auth design rather than resurrecting this intermediate state. |

## Closed, unmerged PRs intentionally not carried forward

- #3 — Temporary dependency audit investigation: read-only report; explicitly no repository changes.
- #5 — Temporary dependency audit run: audit-only PR, explicitly intended to be closed after collecting the report. The actual nanoid security fix was merged separately in PR #4.

## Important merged successors already on main

The historical search confirms the following important work was merged, rather than abandoned:

- #1–#2: agent foundation and Android-first Eve web chat.
- #4: nanoid security update.
- #8: combined owner sign-in and Phase 1 research implementation.
- #10–#11 and #16: persistent learning, exact external IDs, and memory reliability tests.
- #13 and #17: successive chat access changes.
- #14–#15: earned-growth service studio foundation and evidence-based skill benchmark.
- #19–#25: resource catalog architecture/intake, quota/execution guardrails, owner-approved task lifecycle, and scheduled task loop.
- #26–#30: local-first seller inventory reconciliation, verified tool-access mission, bounded public research, runtime activation documentation, and guarded Worker deployment workflow.
- #31–#33: quota-aware resource manager, protected credential diagnostic, and verified GitHub owner sign-in.
- #35: revenue-first autonomy guardrails.

## Current cumulative development chain

The active work is deliberately stacked so the newest capability PR includes the preceding unmerged feature work:

1. PR #36 — keyless GDELT news discovery; base of PR #37.
2. PR #37 — transparent revenue opportunity evaluator; base of PR #38.
3. PR #38 — evidence-backed capability benchmark reporter.

This stacking is source-control integration only. It does not merge any PR, deploy Production, or authorize external actions. CI must be checked against the exact current head SHAs after the base changes. Vercel Preview builds should remain canceled/avoided where possible to protect the Hobby quota.

## Preservation rules going forward

1. Before closing or replacing a PR, compare its changed files and behavior with the proposed successor.
2. Record every closed unmerged PR and its disposition here.
3. Carry unique tests, docs, migrations, and safety policies forward—not just the headline feature.
4. Do not copy obsolete security/auth implementations over newer decisions.
5. Treat a feature as preserved only when its successor contains the implementation and its tests, or when an explicit reason documents why it was intentionally dropped.
6. Never equate a merged PR with a live deployed capability; verify runtime activation separately.
