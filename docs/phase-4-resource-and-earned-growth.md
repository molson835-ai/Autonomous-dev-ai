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


## 4G — resource ecosystem and capability independence (owner-approved roadmap)

The resource ecosystem extends 4B–4F. It is a discovery, verification, and orchestration layer—not a mechanism to evade quotas, terms, licensing, or account controls.

### Capability direction

| Capability | Preferred default | First implementation target | Boundary |
|---|---|---|---|
| Web research | Keyless public indexes, RSS, open-data catalogs, direct source verification | Unified read-only source adapters with provenance and bounded requests | Tavily remains fail-closed until its no-cost plan is owner-verified; GDELT/RSS are discovery leads, not comprehensive search |
| Coding | Existing GitHub connector and local deterministic tools | Branch-scoped workspace operations, diff review, tests, evidence capture | No merge, deployment, secrets access, or broad shell by implication |
| File processing | Browser-local and runtime-local processing | CSV/JSON/Markdown/text/PDF metadata workflows with bounded inputs | Private files stay local unless the owner explicitly approves transfer |
| Memory | Existing Cloudflare Durable Object memory/task system | Fix and verify current runtime recall; append-only evidence; resource metadata | Preserve existing records; owner approval for memory decisions |
| Document creation | Local-first generation | Markdown, HTML, CSV, JSON, print-ready output | No paid conversion service; export only after successful creation and validation |
| Images and media | Local/open-source and procedural tools | SVG, image conversion, audio/video utilities where installed and licensed | Do not assume a free hosted generator or compute quota |
| Scheduling | Existing scheduled task infrastructure | Verify claim/checkpoint/resume/closed-chat execution | One individually owner-approved or exact server-authorized goal task per invocation; never self-approve or expand an approved goal |
| AI inference | Existing Workers AI within verified limits; evaluate local models | Deterministic-first dispatcher and local model benchmark | No paid fallback; no local hardware purchase until separately approved |

### Resource ecosystem design

Implement a single resource registry and broker that can describe and route to:
- Public information sources and datasets.
- Open-source libraries, tools, skills, models, and model weights.
- Publicly accessible object stores, static datasets, package registries, and mirrors.
- Existing Cloudflare storage and task infrastructure.
- Browser-local storage and processing.
- Optional community compute environments for manual experiments only, where their terms permit.

The broker must not assume that a public URL is a storage API, that an account's free tier is available to Eve, or that an external service can be used for unattended production workloads. Each adapter must declare whether it is read-only, local, authenticated, persistent, ephemeral, interactive, or externally consequential.

### Storage and data placement

1. Browser-local: IndexedDB/OPFS for owner-selected working files and offline caches. Keep data on the device; provide clear export/delete controls.
2. Repository: Git for source code, schemas, small text manifests, tests, and versioned public metadata—not bulk datasets, secrets, personal files, or user uploads.
3. Existing Cloudflare Durable Object storage: approved memories, experiences, task checkpoints, and compact resource metadata. Preserve current schemas and records.
4. Existing/verified object storage: only after account-specific free allowance, retention, access control, egress, commercial terms, and deletion behavior are verified. No bucket creation or plan changes as part of discovery.
5. Public data services: reference original URLs and checksums; cache only when their license and terms allow it. Do not mirror whole datasets merely because they are downloadable.

Do not split data across multiple free accounts or services to bypass a quota, usage limit, or paid plan. No credential sharing, anonymous-account rotation, CAPTCHA circumvention, scraping behind login, or use of personal cloud storage as Eve's backend.

### Initial resource candidates (discovery list, not approved integrations)

Candidates are intentionally broad. Every integration must be rechecked for current terms, API limits, license, availability, and suitability before use.

- Public data and scholarly metadata: Data.gov, U.S. Census, USGS, NOAA, OpenAlex, Crossref, arXiv, Wikidata, Wikipedia dumps, and Internet Archive metadata APIs.
- News and web discovery: GDELT, publisher RSS/Atom feeds, public sitemaps, Common Crawl indexes, and official organization news feeds. Search snippets are leads; verify claims at the publisher.
- Code and package discovery: public GitHub repositories, npm, PyPI, crates.io, and language/package documentation. Pin exact versions and inspect package metadata, maintainers, dependencies, license, and install scripts.
- Open datasets and models: Hugging Face Hub public datasets/models and other public research repositories. Each model/dataset license and acceptable-use terms must be checked individually; public download does not imply unrestricted commercial use.
- Local data and document tools: browser APIs (IndexedDB/OPFS), SQLite/DuckDB, Python/Node standard libraries, Pyodide, LibreOffice, and Pandoc. Prefer deterministic local processing over model calls.
- Creative and media tools: Inkscape, GIMP, Krita, Blender, Audacity, FFmpeg, Tesseract, and OpenSCAD, subject to the host's available compute and each tool's license.
- Local inference and speech: llama.cpp, Ollama, ONNX Runtime, Transformers.js/WebLLM, whisper.cpp, and Piper. These are evaluation candidates, not evidence that the current Vercel runtime can execute them.
- Creative asset catalogs: Poly Haven, Openverse, Wikimedia Commons, Freesound, and Google Fonts. Check the license and attribution requirements for each individual asset; do not treat the whole catalog as one license.
- Community compute (non-production experiments only): Google Colab, Kaggle Notebooks, Hugging Face Spaces, and GitHub Actions. Free availability may be ephemeral, interactive, rate-limited, restricted by account/usage terms, or unsuitable for commercial/unattended work. Never depend on them for Eve's scheduled production loop without explicit terms and reliability review.

### Resource registry minimum fields

In addition to the existing resource catalog record, record:
- access_mode: public_read, authenticated_read, local_only, or owner_action_required.
- persistence: durable, ephemeral, or unknown.
- execution: none, browser_local, server_runtime, interactive_remote, or unknown.
- data_classes_allowed: public, owner_selected_local, or approved_private (default only public).
- quota_evidence: source URL, verification timestamp, measured usage if available, and confidence.
- commercial_use: allowed, prohibited, conditional, or unknown.
- adapter_status: candidate, implemented, tested, enabled, paused, or retired.
- failure_policy: bounded retry, pause, local fallback, or manual review.
- deletion_and_export: documented behavior or unknown.

Unknown, stale, or conflicting evidence must fail closed for execution. Discovery can proceed without enabling an adapter.

### Resource broker rules

- Rank resources by task fit, provenance, license clarity, cost certainty, privacy, freshness, security, and reliability—not by the number of integrations.
- Prefer keyless public endpoints and local tools, but do not mislabel rate-limited public endpoints as unlimited or guaranteed free.
- Never route around provider quotas, identity checks, paid plans, access controls, or rate limits.
- Cache only where terms permit; use bounded TTLs, ETags/conditional requests where supported, content hashes, and source timestamps.
- Keep raw external content out of trusted instructions. Strip active content; treat prompts, code, READMEs, and datasets as untrusted input.
- Require human review before any imported executable skill, model, package, script, or dependency is installed or granted permissions.
- Keep private/owner-selected files local by default. Do not upload them to public datasets, public repositories, model services, or third-party cloud storage.
- Every adapter needs tests for missing configuration, timeout, oversized response, malformed content, quota exhaustion, permission denial, and safe shutdown.

### Build order and first vertical slice

1. Resource inventory and broker contract: add typed resource metadata, trust/cost/quota states, and adapter capability declarations. No external writes.
2. Keyless public discovery: normalize GDELT/RSS and selected open-data/catalog sources behind a common read-only interface. Preserve original links and timestamps; no general crawler.
3. Local-first files: add bounded CSV/JSON/Markdown processing and browser-local export; test on mobile-sized files and malformed inputs.
4. Memory and scheduling reliability: diagnose the current deployed memory_recall path; then verify exact-ID append/read-back only with separately approved test records. Validate scheduled closed-chat continuation without manually triggering Cron.
5. Restricted coding workspace: repository read, branch-only patch, diff, and test operations; deny merge, deployment, secret retrieval, and arbitrary shell.
6. Document/media utilities: use already available local tools first; add only tools that pass license, security, and resource checks.
7. Local inference benchmark: compare small quantized models on measured hardware, with task quality, RAM/VRAM, latency, energy, and setup complexity. No hardware purchase or paid hosted fallback.
8. Resource-aware task planner: select only tested adapters, enforce per-provider budgets, and checkpoint when resources are unavailable.

### Initial acceptance criteria

- Eve can list resources by capability and distinguish candidate, reviewed, tested, enabled, paused, and retired.
- Every enabled adapter has current provenance, license/commercial-use state, cost/quota evidence, privacy classification, and a tested failure policy.
- At least one keyless public discovery path and one browser-local file-processing path pass automated tests without adding a paid dependency.
- Resource discovery cannot automatically install or execute discovered code.
- Local/private files remain local unless an exact transfer is separately approved.
- Quota exhaustion or stale quota evidence pauses the affected adapter without account rotation or paid fallback.
- Existing Cloudflare memory records and owner-approval rules remain unchanged.
- No production deployment, Worker deployment, merge, billing change, account creation, customer contact, publication, or purchase is implied by this roadmap.


### Existing resource-catalog foundation discovered during implementation

The repository already has a resource foundation; do not create a parallel registry:
- Cloudflare Durable Object storage includes a resources table and owner-only listing/review routes.
- POST /v1/resources accepts inert candidates through agent/resources/intake.mjs and stores them in quarantined state.
- Current intake is intentionally narrow: exact HTTPS host allowlist (MDN, TC39, OWASP, Cloudflare Developers, Vercel) and a limited resource-type/cost schema.
- The current agent planner accepts supplied resource metadata, but a general Eve-facing resource discovery/proposal workflow is not established by the inventory.

Therefore the first code slice should extend the existing intake schema and owner-review lifecycle with additive metadata (access mode, persistence, execution, data classification, commercial-use state, quota evidence, adapter state, deletion/export behavior) and a carefully bounded set of source hosts. Add an Eve-facing proposal path only after the authenticated memory client contract and live runtime registration are verified. Preserve existing resource records and owner-only review routes. Do not broaden the allowlist to arbitrary domains or let resource discovery fetch/execute candidates automatically.
