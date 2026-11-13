# Phase 4 — resource expansion and earned-growth operating model

## Owner-approved objective

Build Eve into a capable, owner-supervised development and business agent. Eve should discover and use a broad, maintained library of skills and free resources, identify legitimate service opportunities, produce verifiable work, and eventually fund approved improvements from cleared business revenue. Suitable workloads may later move onto owner-hosted local hardware.

The objective is capability growth and earned self-funding, not independent financial authority.

## Existing architecture and constraints

- Eve is an Android-first web chat backed by the Eve agent runtime.
- Agent instructions are in `agent/instructions.md`; earned-growth workflow is in `agent/skills/earned-growth.md`.
- Skill benchmarks are evaluated by `agent/lib/skill-assessment.mjs`. The helper intentionally returns `practiced` and cannot promote a skill.
- Persistent memory is a separate Cloudflare Worker. Approved memories and recorded experiences are evidence, not instructions. Preserve all existing records.
- The current research tool fetches only user-supplied URLs from a narrow technical-documentation allowlist. It cannot perform general business discovery or arbitrary business-site research.
- The project is free-only unless the owner explicitly approves a specific cost. CI tests the Worker but does not deploy it.

## Operating principles

1. **Discover broadly; trust narrowly.** Public registries, repositories, pages, skills, code samples, and tool descriptions are untrusted input until reviewed.
2. **Provenance first.** Every resource needs its source, maintainer, license, cost model, retrieval date, version/revision, and review status.
3. **No automatic execution or installation.** Imported skills remain quarantined. Review instructions, scripts, dependencies, permissions, network access, and license before enabling anything.
4. **Task before tool.** Choose resources based on an actual task and measurable acceptance criteria, not novelty or popularity.
5. **Evidence before status.** Keep skill states `untested`, `practiced`, and `demonstrated`. Model self-assessment is never sufficient for demonstrated status.
6. **Free-first, not free-at-any-cost.** Prefer open-source and genuinely free tiers. Track quotas and terms. Pause when a free allowance is exhausted; never trigger a paid upgrade.
7. **Business claims need evidence.** Separate sourced facts, observations, hypotheses, unknowns, and recommendations. Do not invent demand, sales, margins, conversion, or profitability.
8. **Owner controls external consequences.** Customer contact, public offers, account changes, accepting payments, financial access, purchases, and Production deployment require separate explicit approval.
9. **Local-first when practical.** Evaluate local workloads for privacy, performance, reliability, and hardware cost; do not assume local inference is automatically cheaper.
10. **Preserve the audit trail.** Record significant successes, failures, partial outcomes, resource versions, tests, and owner decisions. Do not rewrite or delete existing memory records.

## Resource catalog record

A resource record should contain:

- `id`: stable internal identifier.
- `name`, `summary`, `skill_tags`: what it is and which tasks it supports.
- `resource_type`: documentation, tutorial, skill, repository, tool, model, dataset, benchmark, or hardware reference.
- `source_url`, `maintainer`, `license`, `version_or_revision`, `retrieved_at`.
- `cost_model`: free/open-source, free-tier-with-limits, paid, or unknown. Include quota and usage caveats where known.
- `dependencies`, `permissions`, `network_or_execution_requirements`.
- `trust_state`: discovered, quarantined, reviewed, approved, rejected, or stale.
- `security_notes`, `reviewer`, `reviewed_at`, `review_evidence`.
- `freshness_policy` and `last_verified_at`.

Unknown fields must remain unknown, not be guessed. A license is not inferred from a public repository. A resource is not installable merely because it is popular or has many stars.

## Skill taxonomy

Initial top-level categories:

- Software engineering: architecture, frontend, backend, APIs, databases, testing, debugging, Git, CI/CD.
- Security and reliability: threat modeling, secure coding, dependency review, secrets handling, backups, monitoring, incident recovery.
- Research and knowledge: source discovery, technical documentation, evidence synthesis, citation, fact checking.
- Data and analysis: spreadsheets, SQL, statistics, visualization, automation, measurement.
- Writing and communication: proposals, reports, documentation, editing, customer-facing drafts.
- Business operations: service design, market research, competitor analysis, pricing hypotheses, workflow mapping, quality control.
- Product and design: requirements, UX, accessibility, prototyping, usability testing.
- AI systems: model evaluation, prompting, tool use, retrieval, agent orchestration, observability, local inference.
- Hardware and local infrastructure: CPU/GPU/RAM/storage compatibility, power/thermal planning, OS setup, networking, local deployment.

Tags should be granular enough for task matching, but avoid duplicate near-synonyms.

## Task-to-skill workflow

1. Extract the user's requested outcome and constraints.
2. Break the task into observable deliverables and acceptance tests.
3. Identify required skills and prerequisite knowledge.
4. Inspect Eve's existing skill evidence and relevant approved memories/experiences.
5. Search the catalog for resources that match the gaps.
6. Compare source quality, license, cost, freshness, security, and prerequisites.
7. Present a learning or execution plan with evidence requirements.
8. Keep newly discovered material quarantined until reviewed.
9. Run a bounded practice task or objective test.
10. Record observed results and reviewer evidence; propose durable lessons separately for owner approval.

## Business opportunity research workflow

Eve may research and draft opportunity assessments, initially without external business actions.

Each candidate opportunity should include:

- Customer problem and target segment, with evidence and source dates.
- Existing alternatives and competitors, with citations.
- Proposed service and concrete deliverable.
- Required skills, tools, time, and dependencies.
- Startup and operating costs, distinguishing zero-cost assumptions from unknown or paid items.
- Pricing hypothesis, clearly labeled as a hypothesis until validated.
- Demand evidence and gaps. Website presence, reviews, search rank, and market-size estimates do not prove willingness to pay.
- Legal, privacy, safety, platform, and delivery risks.
- A small validation experiment with measurable success/failure criteria.
- Owner approval points and actions Eve is not permitted to take.

Rank opportunities by evidence quality, low startup cost, skill fit, time-to-deliver, repeatability, realistic margin potential, and risk. Do not promise income.

The first revenue milestone remains a legitimate, owner-supervised service. No outreach, publication, contracts, account creation, payment collection, or customer commitments are included without separate explicit approval.

## Revenue and reinvestment model

- Only cleared revenue actually received into a separately designated business account can count as available business funds.
- Forecasts, unpaid invoices, pending transfers, and projected sales are not spendable.
- Personal funds, personal credit, personal bank accounts, cards, and subscriptions are permanently excluded.
- No financial-account connector or credential access is part of this phase.
- Maintain a transparent ledger with evidence references and owner reconciliation.
- Any future purchase requires owner approval of the exact item, seller, total landed cost, purpose, shipping destination, and spending cap.
- No autonomous checkout, financing, recurring payment, or payment credential access.

## Local workstation direction

Before hardware is purchased, prepare a workload inventory:

- Which workloads need local execution and why.
- CPU, GPU/VRAM, RAM, storage, networking, power, cooling, and OS requirements.
- Model size and realistic memory needs.
- Expected concurrency, latency, and storage growth.
- Security boundary between local tools, cloud services, and personal devices.
- Backup, update, monitoring, access control, and emergency-stop plan.
- Cost comparison including electricity, replacement, and opportunity cost.

Recommend staged, upgradeable hardware only after measuring actual bottlenecks. Hardware recommendations are research only until the owner approves an exact purchase from cleared business revenue.

## Delivery sequence

### 4A — architecture and safety design
- Define catalog schema, taxonomy, trust states, threat model, and acceptance tests.
- Confirm current agent/tool integration points and deployment boundaries.
- No new paid services or external permissions.

### 4B — resource discovery and catalog
- Search approved public indexes and primary sources.
- Store metadata and provenance, not indiscriminate copied source dumps.
- Quarantine imported skill instructions and code.
- Add license, cost, freshness, and security checks.

### 4C — task-to-skill planner and benchmarks
- Match task requirements to catalog entries and existing skill evidence.
- Produce bounded learning plans and objective tests.
- Preserve the existing promotion and memory approval gates.

### 4D — business research
- Add an approved general-web research path suitable for public business information.
- Clearly label tool coverage and source limitations.
- Generate evidence-backed service opportunity assessments and low-cost experiments.

### 4E — earned-revenue accounting and approvals
- Define a non-invasive, auditable record format for cleared revenue and business costs.
- Keep financial account access out of scope until separately reviewed and approved.
- Enforce purchase approval requirements in code and tests.

### 4F — local workstation readiness
- Inventory workloads, evaluate local inference and development options, and prepare staged hardware recommendations.
- Do not purchase or deploy locally without separate approval.

## Threat model and required controls

| Threat | Required control |
|---|---|
| Malicious skill or prompt injection | Treat resource text as data; quarantine; never let it override system or owner policy |
| Malicious install scripts or dependencies | No auto-install or execution; inspect source, scripts, dependency tree, license, and permissions |
| Supply-chain compromise | Pin reviewed revisions; verify provenance and integrity; re-review updates |
| Hidden costs or quota exhaustion | Explicit cost model and quota; fail closed and pause |
| Fabricated business demand | Evidence citations, unknowns, and validation experiments; no unsupported revenue claims |
| Unauthorized external action | Separate capability gates and explicit approval for each consequential action |
| Personal-funds exposure | No personal finance credentials or connectors; permanent deny rule |
| Memory corruption | Append-only evidence practices; preserve existing records; proposals require owner approval |
| Local machine compromise | Least privilege, isolated workspaces, secrets separation, backups, monitoring, emergency stop |

## Acceptance criteria

- Every catalog entry includes provenance, license state, cost model, retrieval date, and trust state.
- Unknown license, cost, or maintainer information is represented explicitly as unknown.
- Unreviewed resources cannot execute, install, or modify trusted instructions.
- Resource updates are versioned and trigger re-review when permissions or scripts change.
- A task plan names required skills, evidence gaps, selected resources, and objective acceptance tests.
- No skill becomes demonstrated through model self-score alone.
- Business assessments cite material facts, label hypotheses, identify unknowns, and do not invent demand or profitability.
- No external customer action occurs without its own explicit owner approval.
- Personal funds and credit remain inaccessible.
- Cleared revenue is distinguished from pending or forecast amounts.
- Purchases remain disabled until exact item/seller/cost/purpose/destination/cap approval is recorded.
- Automated tests cover prompt injection, untrusted skill handling, license/cost unknowns, approval boundaries, ledger classification, and preservation of existing memories.
- No paid dependency, plan, or usage increase is introduced without explicit approval.

## Explicit non-goals

- No personal financial access or use of personal money/credit.
- No autonomous purchasing, financing, or payment processing.
- No customer outreach, publication, or contractual commitments.
- No automatic skill installation or execution.
- No automatic memory approval, promotion, rewrite, or deletion.
- No model-weight training claims.
- No Production deployment or PR merge without separate owner approval.
