# Read-only runtime diagnostics

The `runtime_diagnostics` tool is a read-only inspection of the active Eve execution context.

It reports:
- Current caller authentication metadata and whether the immutable configured GitHub owner ID matches. Caller and owner IDs are never returned.
- The current interactive turn's stateful-tool gate decision, including explicit read-only precedence and the Production environment requirement.
- The repository-maintained source-defined tool list and the nine tools wrapped in the session write gate.
- The exact verification boundary for the live runtime manifest and integrations.

## Important limits

The documented Eve `ToolContext` exposes the current session, auth principal, messages, and invoked tool name. It does not document an accessor for enumerating the effective tool registry after dynamic resolution. Therefore this tool reports the live manifest as unavailable rather than presenting source filenames as live-registered tools. A successful call proves that `runtime_diagnostics` itself was callable; it does not prove that the other listed tools are available.

This tool performs no HTTP requests, memory operations, task operations, or writes. Integration health is deliberately reported as `not-tested`; each integration requires a separate bounded read-only check and its own evidence.

The source-defined inventory is maintained explicitly and tested for uniqueness and expected count. Keep its list, tests, and the actual `agent/tools/` directory synchronized whenever a tool is added or removed. The inventory is not automatically discovered and does not prove runtime registration.

The diagnostic's JavaScript helper has a companion `.d.mts` declaration so the TypeScript agent build can type-check its import.

## Verification sequence

1. Deploy only after a separate owner approval.
2. Invoke `runtime_diagnostics` from the authenticated owner session using an explicitly read-only prompt.
3. Confirm `verifiedGithubOwner=true`, `explicitReadOnlyTurn=true`, and `statefulToolsAllowedForThisTurn=false`.
4. Compare the returned source list with the repository tree.
5. Separately invoke each desired read-only integration and retain its actual response or error. Do not infer integration health from configuration variables or this diagnostic.
