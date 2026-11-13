# Phase 4 resource intake

The first executable resource-intake step is deliberately metadata-only.

- Candidate URLs must use HTTPS and an exact research allowlist host.
- Intake never fetches a URL, installs a package, runs code, grants a permission, or changes an existing catalog record.
- Missing maintainer, license, version, and cost details are recorded as `unknown`, not inferred.
- Every candidate enters `quarantined`; callers cannot submit trust state or reviewer fields.
- Approval remains a separate human-reviewed action supported by evidence.
- This module is not yet persistent storage. Durable catalog storage and read/write API design are a later milestone after this intake contract is tested.

The current allowlist is intentionally narrow: MDN, TC39, OWASP, Cloudflare Developers, and Vercel documentation.
