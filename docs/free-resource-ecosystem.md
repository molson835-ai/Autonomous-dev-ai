# Eve free-resource ecosystem and capability catalog

**Status:** discovery candidates; no new service is enabled by this document.  
**Owner direction:** free-first, local-first, lawful, auditable, and no paid fallback.

## Purpose

Give Eve a maintained map of resources she may use to research, build, process files, create deliverables, preserve knowledge, and evaluate local AI. The goal is to combine capabilities safely—not to collect credentials or consume every free tier available.

A resource can be public, free to download, open source, or free to try while still having restrictions on commercial use, redistribution, automation, storage, rate, or retention. Treat those as separate properties.

## Resource families

| Family | Candidate sources/tools | Useful capability | Important checks before integration |
|---|---|---|---|
| Public/open data | Data.gov, Census, USGS, NOAA, OpenAlex, Crossref, arXiv, Wikidata | Evidence, datasets, public records, research metadata | API limits, dataset license, attribution, personal-data exposure, freshness |
| Web discovery | GDELT, RSS/Atom, public sitemaps, Common Crawl indexes, official news feeds | Discover sources without a new paid search API | Coverage gaps, crawl/robots terms, publisher verification, rate limits |
| Code/package indexes | GitHub public repos, npm, PyPI, crates.io | Find libraries, examples, dependencies | Exact license, maintainer health, pinned revision, install scripts, transitive dependencies |
| Models/datasets | Hugging Face Hub and public research repositories | Model evaluation, training/evaluation datasets | Per-artifact license, commercial rights, model-card limits, dataset provenance, safety |
| Local data processing | IndexedDB/OPFS, SQLite, DuckDB, Python/Node standard libraries, Pyodide | CSV/JSON/text processing, query, transform, validation | Browser support, memory caps, file size, privacy, deterministic tests |
| Documents | Markdown, HTML, Pandoc, LibreOffice | Reports, structured exports, print-ready documents | Installed binaries, fonts, format fidelity, license |
| Image/media | Inkscape, GIMP, Krita, Blender, Audacity, FFmpeg, Tesseract, OpenSCAD | Vector graphics, image editing, 3D, audio/video, OCR, CAD | Binary availability, codec/patent considerations, source asset rights, resource limits |
| Speech/local inference | llama.cpp, Ollama, ONNX Runtime, Transformers.js/WebLLM, whisper.cpp, Piper | Local models, transcription, speech output | Model license, device compatibility, RAM/VRAM, latency, energy, mobile/browser support |
| Creative assets | Poly Haven, Openverse, Wikimedia Commons, Freesound, Google Fonts | Legal media building blocks | Check individual item license and attribution; catalog-level name is not a license |
| Existing storage | Current Cloudflare Durable Object memory/task store; Git repository | Compact approved memory, checkpoints, source, tests | Preserve schemas/records; quotas; access policy; repo not bulk storage |
| Browser-local storage | IndexedDB/OPFS | Owner-selected working files, offline cache | Local device capacity, clear export/delete controls, no silent sync |
| Community compute | Colab, Kaggle Notebooks, Hugging Face Spaces, GitHub Actions | Manual experiments and benchmarks | Ephemeral sessions, inactivity shutdown, account quotas, commercial/automation terms; not production infrastructure by default |

## Storage strategy: use what already exists first

1. Owner device/browser: process selected files in-browser; use IndexedDB/OPFS for working copies and cache. Clearly disclose when data stays on-device.
2. GitHub repository: source code, small schemas, tests, text docs, and resource manifests. Do not use Git history as a blob store or place secrets/private user files in a public repository.
3. Cloudflare Durable Object: existing approved memories, experiences, task checkpoints, and compact registry metadata. Do not replace or bulk-migrate current records.
4. Cloud/object storage: investigate existing account allowances only when needed. Before enabling, verify account-specific free quota, egress, retention, commercial terms, access control, and deletion. R2/Blob/other storage is a candidate only; no allowance or commercial suitability is assumed.
5. Public repositories and datasets: reference canonical URLs and checksums. Cache only if permitted; prefer metadata and small derived indexes over copying source collections.

Never use multiple accounts, rotating identities, public proxies, or service combinations to bypass limits. Do not treat a personal Drive/Dropbox account as an unattended backend. Do not assume public buckets are stable, private, or writable.

## Initial discovery shortlist

These are starting points for Eve's catalog—not a claim that they have been integrated or that their current terms have been verified.

### Research and open data
- Data.gov — U.S. government open-data catalog.
- U.S. Census — demographic and geographic data.
- USGS and NOAA — public earth, weather, and environmental datasets.
- OpenAlex and Crossref — scholarly metadata.
- arXiv — research preprints; verify reuse rights for full text and figures.
- Wikidata and Wikipedia dumps — structured/general knowledge; respect dataset licenses and attribution.
- Internet Archive metadata APIs — discovery of archived public materials; do not assume unrestricted reuse or permanent availability.
- GDELT, RSS/Atom and public sitemaps — source discovery; confirm facts at original sources.
- Common Crawl — large-scale web index/data; check dataset terms, size, and privacy implications before any use.

### Software and creative tooling
- SQLite/DuckDB and browser storage APIs for local structured data.
- Pyodide for selected Python workloads in a browser, subject to package/browser limits.
- Pandoc/LibreOffice for document conversion when binaries are available.
- Inkscape, GIMP, Krita, Blender, Audacity, FFmpeg, Tesseract and OpenSCAD for media/CAD tasks where installed.
- llama.cpp/Ollama and ONNX Runtime for local inference evaluation.
- Transformers.js/WebLLM for browser-side model experiments where WebGPU and device memory permit.
- whisper.cpp and Piper for local speech workflows.

### Asset libraries
- Poly Haven, Openverse, Wikimedia Commons, Freesound and Google Fonts.
- Verify each asset's own license, attribution, commercial-use terms, and any relevant model/property releases.

### Community compute
- Colab, Kaggle Notebooks, Hugging Face Spaces and GitHub Actions are suitable only for bounded experiments after terms and quotas are checked. Free compute can be ephemeral and should not be relied on for unattended agent operation, private data, or revenue-critical services.

## Resource record

Every candidate should be stored with at least:

```json
{
  "id": "stable-id",
  "name": "Resource name",
  "resource_type": "dataset|api|tool|library|model|compute|storage|asset",
  "source_url": "https://canonical-source.example/",
  "maintainer": "known maintainer or unknown",
  "license": "exact license or unknown",
  "commercial_use": "allowed|prohibited|conditional|unknown",
  "cost_model": "free-open-source|free-tier-limited|paid|unknown",
  "quota_evidence": {
    "source_url": "https://official-pricing-or-terms.example/",
    "checked_at": "ISO-8601 timestamp or unknown",
    "limits": "exact verified limit or unknown"
  },
  "access_mode": "public_read|authenticated_read|local_only|owner_action_required",
  "persistence": "durable|ephemeral|unknown",
  "execution": "none|browser_local|server_runtime|interactive_remote|unknown",
  "data_classes_allowed": ["public"],
  "version_or_revision": "pinned version or unknown",
  "dependencies": [],
  "permissions": [],
  "security_notes": [],
  "trust_state": "discovered|quarantined|reviewed|approved|rejected|stale",
  "adapter_status": "candidate|implemented|tested|enabled|paused|retired",
  "retrieved_at": "ISO-8601 timestamp",
  "last_verified_at": "ISO-8601 timestamp or unknown",
  "review_evidence": []
}
```

## Trust and enablement lifecycle

discovered → quarantined → reviewed → approved → implemented → tested → enabled

Any change to license, maintainer, version, permissions, dependencies, cost, quota, or data handling can move an item to stale and require review. Rejected items remain recorded with a reason. Never execute a resource merely because its metadata was cataloged.

## First practical integrations

1. A read-only registry for resource metadata, using a schema and tests.
2. Keyless public discovery from RSS/GDELT and selected official catalogs; bounded, cached, provenance-preserving.
3. Browser-local CSV/JSON/Markdown processing and export.
4. Existing Cloudflare memory/task service reliability checks.
5. Restricted branch-only GitHub development tools.
6. Local media and model benchmarks only after confirming runtime/device support.

## Non-goals and prohibitions

- No quota evasion, account rotation, proxy abuse, or bypassing access controls.
- No automatic skill/model/package installation or execution.
- No uploading private files or personal information to public services.
- No paid fallback, subscription, billing change, or quota upgrade.
- No customer outreach, public publishing, purchases, or financial actions.
- No Production deployment or Worker deployment without separate approval.
- No claim that a candidate is free, commercially usable, or reliable until official terms and the actual account/runtime are verified.


## Current implementation baseline (verified in repository)

The resource system is not starting from zero. The Cloudflare Durable Object already stores resource candidates; POST /v1/resources passes them through agent/resources/intake.mjs and forces trust_state to quarantined. Owner-only GET /v1/owner/resources and POST /v1/owner/resources/:id/decision routes provide listing and review. The intake currently allows only a small technical-documentation host list and a limited metadata schema. No public resource is enabled by this catalog document.

Next implementation should extend this existing schema and lifecycle additively, preserve all existing records, and add tests before enabling additional domains or agent-side proposal tools.
