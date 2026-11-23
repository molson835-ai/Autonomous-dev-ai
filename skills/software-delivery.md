---
description: Repeatable workflow for planning, implementing, testing, and reviewing software changes.
---

# Software delivery workflow

Use this playbook whenever the user asks to build, change, debug, or review software.

## Before implementation

- Read the README and project-specific agent instructions.
- Inspect manifests, lockfiles, scripts, nearby source files, and tests.
- Identify branch and working-tree state when available.
- Convert the request into observable acceptance criteria.
- Call out uncertainty that could change architecture or scope.

## Implementation

- Make one coherent change at a time.
- Reuse the existing stack unless there is a clear reason to change it.
- Avoid dependencies for trivial functionality.
- Keep secrets out of source control.
- Add or update tests for behavior changes.
- Preserve backward compatibility unless a breaking change was requested.

## Verification

Run applicable checks in this order:

1. Focused unit or regression tests.
2. Formatting and lint checks.
3. Type checking.
4. Production build.
5. Relevant integration or browser checks.

If a check cannot run because the environment lacks a runtime, credential, service, or device, state that limitation. Never mark an unrun check as passed.

## Review

Check acceptance criteria, scope, error handling, security, meaningful tests, and whether the user can understand the change.

## Completion report

Use these headings:

- Result
- Files changed
- Verification (exact checks and outcomes)
- Known limitations
- Next step
