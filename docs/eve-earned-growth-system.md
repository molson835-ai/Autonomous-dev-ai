# Eve Self-Improvement and Earned Growth System

## Goal

Help Eve earn its first legitimate dollar through a small, useful service while learning from evidence. The first reinvestment category is hardware. Begin with a human-approved service studio and design it to support more autonomy later.

This milestone is planning, preparation, research, evaluation, and recordkeeping only. It does not grant authority to contact customers, publish offers, accept payments, access financial accounts, spend money, or purchase hardware.

## Assumptions

- The project remains free-only: open-source tools and genuinely free tiers only. Pause if a free allowance is exhausted; never silently incur charges.
- The owner's personal funds, cards, credit, accounts, and subscriptions are permanently off limits.
- The owner approves any external customer contact, offer publication, delivery commitment, financial activity, and purchase.
- Revenue means cleared funds actually received, not an estimate, quote, proposal, invoice, or promise.
- Eve's current research tool fetches supplied URLs from a narrow allowlist; it is not general web search.
- Existing approved memories and experiences are read-only evidence. This milestone must not rewrite or delete them.

## Implementation plan

### Phase 1 — Safe service-studio foundation (this PR)

1. Define a small, auditable service-experiment record: customer problem hypothesis, target customer type, proposed deliverable, evidence, effort, quality checks, feedback, outcome, and next experiment.
2. Define a skill-evidence record that distinguishes untested, practiced, and demonstrated competencies. A claim of competence requires a reproducible task and observed evaluation.
3. Define revenue states that distinguish proposed, quoted, pending, and received/verified. A received/verified record requires a positive amount, currency, and a non-sensitive evidence reference. Never store bank, card, payment credentials, or account details.
4. Define hardware candidates as recommendations only, each tied to a demonstrated bottleneck, expected capability gain, free alternatives considered, and a later owner-approved purchase decision.
5. Add pure policy helpers and automated tests for these boundaries. Do not add payment, checkout, customer messaging, financial-account, or purchasing integrations.
6. Keep new learning in the existing proposal/approval model. Do not automatically promote business findings to approved memory.

### Phase 2 — First service prototype

1. Assess Eve's current research, writing, data-analysis, and coding skills using small, repeatable benchmark tasks.
2. Prepare one sample small-business research and improvement report using only public information and free tools.
3. Score the sample for factual support, usefulness, clarity, reproducibility, and time required. Separate sourced facts from assumptions.
4. Research evidence of demand and competitor offerings. Do not infer willingness to pay from likes, generic market-size claims, or unverified posts.
5. Present a service concept, sample deliverable, likely customer type, evidence, uncertainty, and proposed price range for owner review. No public offer or outreach without explicit approval.

### Phase 3 — Owner-approved pilot

1. Only after approval, prepare a specific pilot offer and delivery checklist.
2. Owner authorizes each customer-facing message, publication, and delivery commitment before it happens.
3. Record feedback and actual delivery effort. Record payment as pending until independently confirmed as cleared.
4. Learn from unsuccessful as well as successful experiments. Proposals remain pending until the owner explicitly approves them.

### Phase 4 — Hardware reinvestment recommendations

1. Maintain a ranked list of hardware bottlenecks observed during real tasks (for example, memory capacity, compute, storage, reliability, or testing-device coverage).
2. Compare free workarounds and existing equipment before recommending purchases.
3. Tie every candidate to a measurable capability improvement and a reason the current setup is insufficient.
4. Show total landed cost, seller, purpose, and funding source only when researching a specific purchase.
5. No purchase, order, reservation, payment, financing, or recurring charge without the owner's explicit approval of the exact item, seller, total landed cost, purpose, shipping destination, and spending cap. Use only cleared business revenue in a separately designated business account; never use personal funds or credit.

## Risks and dependencies

- No general search-discovery tool exists yet. Do not claim comprehensive market research until an approved, free discovery method is implemented and tested.
- Public information may be stale, biased, or insufficient to establish demand. Corroborate important claims and label uncertainty.
- A sample report is not proof that customers will pay. Validate demand with an owner-approved pilot.
- Free-tier limits and terms can change. Pause rather than upgrade or incur charges.
- Persistent memory availability does not imply independent database verification. Report only what tool responses and evidence establish.
- This milestone does not create a legal entity, business bank account, payment processor, tax workflow, or independent legal capacity for Eve.

## Acceptance criteria

- A service experiment cannot be marked successful without an observed outcome and evidence reference.
- Skill claims distinguish practice from demonstrated performance and include an evaluation reference.
- Revenue cannot be marked received/verified without a positive amount, currency, and evidence reference; estimates and pending payments never count as available funds.
- No sensitive payment credentials or personal financial account data are accepted by the record model.
- Hardware records are recommendations, not purchase actions.
- A purchase recommendation cannot pass the approval policy unless the owner explicitly approves the exact item, seller, landed cost, purpose, shipping destination, spending cap, and sufficient cleared eligible funds are documented.
- Automated tests cover valid and invalid states, including attempted bypasses.
- No payment, checkout, financial-account, customer-contact, or purchasing integration is introduced.
- Existing memory records and Production infrastructure remain unchanged.
- Build, type-check, and CI tests pass before merge; Preview is tested before any later merge decision.
