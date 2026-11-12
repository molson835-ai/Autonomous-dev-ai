# Phase 2 — Eve skill benchmark

## Purpose

Establish repeatable evidence for Eve's research, writing, data-analysis, and coding abilities before making service-quality claims. This is an evaluation protocol, not a claim that Eve has passed a live model benchmark.

## Benchmark tasks

| Skill | Task | Observable acceptance criteria |
|---|---|---|
| Research | Build a claim/evidence matrix from two supplied public sources | Every factual claim maps to a source; conflicts and unknowns are explicit; no invented facts |
| Writing | Turn an approved fact pack into a one-page small-business improvement report | Clear executive summary, prioritized actions, plain language, no unsupported promises |
| Data analysis | Calculate conversion and change rates from a supplied synthetic dataset | Correct formulas, units, denominator, rounding, and reproducible calculations |
| Coding | Implement a small pure utility against supplied tests | Tests pass, invalid inputs are handled, no unrelated changes, exact command/result recorded |

## Scoring

Each submitted task is scored 1–5 on:
1. factual support;
2. usefulness;
3. clarity;
4. reproducibility;
5. time efficiency.

A score average of at least 4.0 with no dimension below 3.0 makes a task eligible for owner review. It does not automatically establish competence. The helper in `agent/lib/skill-assessment.mjs` deliberately leaves status at `practiced`; only an explicit owner-approved memory proposal can promote a skill to demonstrated.

A model must not review or certify its own work. Automated tests can verify objective coding/calculation criteria, but they do not establish research judgment or customer value.

## Current evidence status

- Repository engineering: CI for the Phase 1 foundation passed the Eve build, Worker bundle/runtime tests, type-check, and safety/research tests. This is evidence that the repository build passes, not proof of independent software-delivery competence.
- Research: the current Eve tool fetches supplied technical documentation URLs from a fixed allowlist. It cannot discover businesses or search the general web.
- Writing: a sample business report is included as a practice artifact. It was prepared from publicly accessible sources outside Eve's current research tool, so it is not evidence that Eve generated it.
- Data analysis: no live model task has yet been run.
- Coding: no isolated live Eve coding task has yet been run.

## Live evaluation still required

Run each task in an actual Eve session, preserve the prompt and output as evidence, run objective tests where available, and have the owner or an independent reviewer score the result. Until those artifacts exist, all skills remain `practiced` or `untested`, never demonstrated.

## Cost and safety

Use existing free-tier resources and local test fixtures. Do not add paid search APIs, billing, customer messaging, payment processing, financial-account access, purchasing, or Production deployment. If free quota is exhausted, pause.
