# Revenue validation workflow — first milestone

## Goal

Turn the existing bounded research and artifact tools into a traceable, owner-reviewable path from a problem signal to a tested deliverable. The first example is the Stock Accuracy & Discrepancy Investigation Kit. This milestone is internal and read-only: it does not contact buyers, publish offers, accept payments, create tasks, or write memory.

## Workflow

1. **Discover** — use the existing bounded GDELT/Google News lead finder. Treat headlines as discovery metadata, not proof.
2. **Inspect** — retrieve only explicitly supplied original pages through the existing bounded public-page reader. Preserve exact URL, title, access time, excerpt and truncation. A retrieved page remains unverified source material.
3. **Assess** — structure observations, hypotheses, unknowns and recommendations. Keep direct buyer statements separate from public problem signals and competitor activity.
4. **Select one experiment** — name one buyer segment, one problem, one deliverable, a smallest useful test, measurable acceptance criteria, expected effort, and dependencies. No demand or revenue forecast is produced from heuristic scores.
5. **Build** — create a small useful deliverable using currently available artifact tools. Validate the file and retrieve it back before claiming it is stored.
6. **Validate** — distinguish a completed usability test, direct buyer problem confirmation, stated willingness to pay, and a verified payment. These are separate evidence types, not interchangeable milestones.
7. **Review** — prepare an owner-facing summary with evidence, unknowns, failures, next step, and any approval needed. Customer contact, publication, payment acceptance, and external commitments remain separately gated.

## Evidence record

Each observation should carry a stable ID, type, concise attributed statement, observation timestamp, and source URL where applicable. Allowed types in the first implementation:

- `public_problem_signal`: public material describing a problem; not proof of demand.
- `competitor_signal`: an alternative product, price, or positioning; not proof of sales.
- `direct_buyer_problem_confirmation`: a direct statement from a buyer; not willingness to pay.
- `stated_willingness_to_pay`: an explicit statement about paying; not a transaction.
- `completed_user_test`: a completed test against named criteria; not a sale.
- `verified_payment`: count only with independent verification, positive amount, ISO 4217 currency code, and a verification reference.

The deterministic helper validates these fields and labels progress conservatively. It does not verify the truth of statements, publisher identity, source independence, or payment authenticity; the independent-verification flag and reference are assertions supplied by a reviewer and must not be treated as cryptographic proof.

## First experiment: Stock Accuracy & Discrepancy Investigation Kit

- **Target segment hypothesis:** small businesses that conduct recurring physical inventory counts and need a simple way to investigate variances.
- **Problem hypothesis:** teams may record a count variance but lack a consistent receiving/root-cause/corrective-action trail.
- **Existing deliverable:** the previously prepared Excel prototype with cycle-count variance, receiving discrepancy, and corrective-action sheets.
- **Unknowns:** frequency and severity of this problem by segment; existing spreadsheet/ERP alternatives; willingness to adopt a separate workbook; willingness to pay; acceptable price; required features.
- **Initial internal test:** verify formulas, dropdowns, sample data, instructions, and usability with fictional data. A successful internal test is not buyer validation.
- **Next validation step:** prepare a concise interview/test script and evidence template for owner review. Do not contact anyone until separately approved.

## Safety and acceptance criteria

- No new paid dependencies, provider credentials, billing, external communication, publication, sales listing, or payment integration.
- No automated task, queue, memory, or Worker writes.
- Invalid, duplicate, malformed, or unsafe evidence records are rejected.
- Public signals cannot be classified as buyer confirmation or revenue.
- A payment is counted only with independent verification, positive amount, three-letter currency, and reference.
- Output never generates a revenue forecast.
- Tests cover evidence classification, malformed URLs/timestamps, duplicate IDs, and payment verification requirements.
- Production deployment and merge remain separate owner approvals.
