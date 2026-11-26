# Durable owner-visible artifact store

## Intent

Allow Eve to preserve reusable HTML research reports and product deliverables beyond the lifetime of a tool response, then retrieve them by stable ID and let the verified owner inspect or download them from the Owner Console.

## Goals

- Persist only artifacts already accepted by the existing standalone HTML validator.
- Store content in the existing Cloudflare Durable Object, with no new service or dependency.
- Keep agent writes behind the existing canUseWriteTools gate.
- Allow Eve to retrieve artifacts by UUID through a read-only tool.
- Expose owner-authenticated list, detail/download, and explicit delete controls.
- Bound each artifact to 64 KiB original HTML, at most 20 stored items, and 1 MiB aggregate stored content.
- Preserve task, memory, quota, and resource records unchanged.

## Non-goals

- Arbitrary file uploads, executable binaries, ZIPs, scripts from external URLs, or filesystem access.
- Public artifact URLs, anonymous access, or third-party sharing.
- Automatic cleanup, deployment, publishing, customer contact, or sales actions.
- Changing task checkpoints or memory semantics.

## Approach

Extend the existing MemoryStore SQLite schema with an additive artifacts table. The existing create_artifact tool validates the HTML and then submits the same name/content to the authenticated Worker; the Worker validates again before persistence. Add a read-only get_artifact tool. Extend the existing GitHub-owner-authenticated Owner Console proxy and UI with list, download, and explicit confirmed deletion.

## Security and limits

- Agent writes use the existing shared MEMORY_API_TOKEN and existing dynamic write-tool authorization gate.
- Owner list/detail/delete routes remain protected by GitHub owner verification and same-origin proxy checks.
- Content is validated as a standalone HTML artifact and receives the existing preview CSP.
- UUID identifiers only; all SQL is parameterized.
- 64 KiB original HTML per artifact; 20 rows maximum; 1 MiB aggregate stored content maximum.
- Request body cap is raised only for the artifact-create route; default 16 KiB limit remains unchanged elsewhere.
- No public CORS route, external storage provider, new secret, paid service, or model call.

## Verification

Worker integration tests cover valid persistence, revalidation, owner-only list/detail/delete, agent retrieval, invalid HTML, body limits, row/aggregate caps, and duplicate/nonexistent IDs. Type-check and CI validate the Owner Console integration. Tests do not authorize Production deployment or Eve task execution.
