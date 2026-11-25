# Framework default-tool surface hardening

## Decision

The root agent now sets both:

- `defaultTools: false` — disables Eve's optional framework default tools.
- `tool: false` — disables the root agent's model-facing `agent` tool, which creates delegated root-copy work.

The Eve framework contract states that authored tools under `agent/tools/` remain available when optional defaults are disabled. Required connection discovery tooling, if connections are configured, is not removed by this setting.

## Why this change

The authenticated Production inventory previously listed framework-provided shell, filesystem, and web tools alongside application-authored tools. The framework's `bash` executor runs shell commands in the shared session sandbox; its file tools read and modify files in that sandbox. Eve's application tool access gate does not wrap those framework defaults.

The current repository does not define an authored `agent/sandbox.ts` or `agent/sandbox/` configuration. Therefore this project has not established a project-specific sandbox provider, workspace mount, network policy, credential policy, or persistence policy in its own source. We should not infer those properties from the inventory or from framework tool descriptions.

Disabling optional defaults removes the generic shell/file/web tool surface instead of relying on prompt instructions or an unverified sandbox configuration. Disabling the root `agent` tool also prevents model-initiated root-copy delegation while this authorization review is in progress.

## What remains available

Application-authored tools under `agent/tools/` remain in the compiled agent. They continue to be governed by their own code and access controls. In particular, the bounded research tools and the task/memory tools are not removed by `defaultTools: false`.

This setting is not a claim that all remaining application tools are safe or that their permissions have been fully certified. The application tool audit remains separate.

## Verification required after a future approved deployment

1. Run the authenticated Production runtime inventory.
2. Confirm framework defaults such as `bash`, `read_file`, `write_file`, `edit_file`, `web_fetch`, `web_search`, and the root `agent` tool are absent.
3. Confirm intended application-authored tools remain listed.
4. Inspect the full discovery diagnostics, not only the warning count. The current Owner Console summary exposes a count and does not identify the six warning codes or source paths.
5. Do not restart Eve or claim runtime behavior is verified solely because a build or deployment succeeds.

## Explicit non-goals

- No change to Cloudflare quota targets, reservations, or ledgers.
- No task claim, schedule, model call, memory write, or live Eve invocation.
- No credentials, network access, sandbox provider, or file workspace are added.
- No tool is installed, downloaded, or executed.
- No merge or deployment is authorized by this change.

## Diagnostic caveat

The framework Agent Info static-tool metadata reports `hasAuth: false` for static tools as a metadata default; it is not sufficient proof that a tool has no runtime authorization. Review the actual executor and access path. Likewise, a discovery warning count is not a security finding until its individual diagnostic codes and source paths are available.
