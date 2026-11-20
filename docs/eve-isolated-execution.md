# Eve isolated execution — architecture decision

## Decision

Use **Vercel Sandbox** as the first candidate for executing untrusted/generated code because Eve already runs on Vercel and Sandbox provides ephemeral Firecracker microVMs. The first execution profile must use:

- One vCPU.
- A 30-second default timeout, with a hard application cap of 60 seconds.
- `persistent: false`.
- `networkPolicy: "deny-all"`.
- No exposed ports.
- No environment variables or credentials passed into the VM.
- No sudo, package installation, shell profile, or user-selected command.
- A bounded input payload and bounded captured output.
- Explicit stop/cleanup in a `finally` block.

The current code adds only a pure policy builder and request validator. It does not import the Sandbox SDK, create a VM, write files, execute a command, or add a runtime tool.

## Why Vercel Sandbox

Vercel documents Firecracker microVM isolation, per-sandbox filesystem/network boundaries, explicit egress policy, ephemeral sessions, and an SDK for creating and stopping sandboxes. The SDK's default network policy is allow-all, so the application must explicitly set deny-all for untrusted execution. The SDK's command runner is not a shell by default, but a shell can be launched explicitly; therefore no arbitrary command string or shell command is accepted by this first profile.

## Cost and account eligibility gate

Vercel's published pricing currently lists 5 sandbox active-CPU hours/month, 420 GB-hours of provisioned memory, 5,000 sandbox creations, 20 GB sandbox data transfer, and 10 concurrent sandboxes on Hobby. Additional active CPU is listed at $0.128/hour. These are platform allowances, not a guarantee that the user's account is eligible for this workload or that all usage will remain free. Vercel's Hobby fair-use terms restrict the plan to personal, non-commercial use. Because Eve's long-term objective includes commercial revenue, **do not enable sandbox execution on Hobby for commercial activity**. Before runtime integration, verify the account plan, current terms, included usage, and a hard spend limit. No upgrade, paid usage, or billing change is authorized by this PR.

## Execution lifecycle (future implementation)

1. Owner-approved development task produces a bounded proposal.
2. Host validates proposal path/content limits and selects a fixed reviewed profile.
3. Host creates a new non-persistent sandbox with deny-all egress and no secrets.
4. Host transfers only the bounded files needed for that test; never clone the full repository into the VM in the initial phase.
5. A fixed executable and fixed argument vector run; do not accept model-authored shell commands.
6. Host checks exit code, captures bounded stdout/stderr, and stops the VM in a `finally` block.
7. Results are evidence only. They do not auto-register a tool, modify the trusted repository, create a PR, merge, deploy, or enable the generated code.

## Deferred capabilities

- Repository writer / GitHub branch creation.
- Network access, including dependency downloads and Git operations.
- Package installation and lifecycle scripts.
- Arbitrary shell, sudo, arbitrary binaries, long-running processes, exposed ports.
- Persistent workspaces or snapshots.
- Automatic tool registration or execution in Eve's trusted runtime.
- Production or Worker deployment.

Each item requires a separate threat model, tests, and explicit capability gate. No credentials may be placed in the sandbox. If a future workflow needs narrowly scoped GitHub access, use a host-side credential broker and a dedicated short-lived token with branch-only permissions; never pass the token into the VM.

## Acceptance criteria before enabling execution

- Account eligibility and costs are verified without exceeding the free allowance.
- A real sandbox can be created and stopped under the intended account and plan.
- Egress-deny behavior is tested from inside the VM.
- No environment secrets are inherited or injected.
- Timeout, output cap, malformed input, cleanup after errors, and duplicate execution are tested.
- The VM cannot access production memory, Worker bindings, owner credentials, personal files, or payment systems.
- The only executable profile is reviewed, fixed, and tested.
- No generated tool can be registered or enabled automatically.
- Owner approval remains required for merge, deployment, and capability activation.

## Current status

The policy builder returns a proposed configuration and the request validator returns `validated_not_executed`. This is not yet a sandbox integration and grants Eve no filesystem, shell, network, package-installation, tool-registration, or generated-code execution capability.
