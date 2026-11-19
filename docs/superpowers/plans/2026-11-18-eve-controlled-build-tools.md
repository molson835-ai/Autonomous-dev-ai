# Eve Controlled Build and Test Capabilities — Implementation Plan

Goal: Let Eve create and test project artifacts in an isolated workspace, submit code changes as reviewable GitHub pull requests, and prepare Vercel previews without granting unrestricted production authority.

Architecture: Add a typed sandbox capability to Eve's runtime using an isolated execution provider; expose bounded file and command operations. Add a GitHub workflow that creates feature branches and pull requests, with CI as the test authority. Preview deployments remain subject to existing Vercel policy. Production promotion remains owner-only.

Tech Stack: Existing Eve framework, TypeScript, Vercel Sandbox (candidate, subject to account/terms confirmation), GitHub integration, existing GitHub Actions and Vercel integration.

## Global constraints
- No new paid plan, usage, API, subscription, or external commitment without separate explicit owner approval.
- All generated code stays in an isolated workspace and non-production feature branch.
- Never expose credentials, environment variables, owner cookies, or private repository secrets to model context or generated code.
- No unrestricted shell on the Vercel application host; use isolated microVM execution only.
- No Production deployment, merge, customer contact, payment setup, or financial transaction without separate exact owner approval.
- Commands must have time, output, resource, and working-directory limits; record exit code and bounded output.
- Use allowlisted commands and deny network by default; enable only necessary package/repository access.
- If provider quota or commercial-use eligibility is uncertain, disable execution rather than incur charges or violate terms.
- Work status, approvals, and artifacts must be accessible from Eve's chat.

## Task 1: Isolated sandbox capability
- Inspect installed Eve SDK documentation and supported tool discovery.
- Confirm Vercel Sandbox eligibility, free quotas, duration limits, network controls, and commercial-use restrictions for this account.
- Write tests first for command allowlisting, path confinement, timeout, output truncation, network policy, and non-zero exit handling.
- Implement short-lived isolated microVM lifecycle with no credential injection.
- Add bounded file read/write/list operations rooted in a designated workspace.
- Add bounded command execution for build/test commands only; prohibit credential, deployment, payment, and arbitrary network actions.
- Run focused tests and full repository CI; record actual results.

## Task 2: GitHub branch and pull-request workflow
- Add tests proving writes can target only an agent-created feature branch.
- Implement branch creation, commit/file changes, diff retrieval, and pull-request creation through scoped GitHub integration.
- Deny direct writes to main, merges, branch protection changes, secrets access, and release publication.
- Ensure every PR includes summary, changed files, test evidence, risks, and Preview link when available.
- Verify with a disposable test branch/PR; do not merge.

## Task 3: CI and Preview verification
- Require typecheck, tests, and build checks on every Eve-created PR.
- Read check results for the exact head SHA; do not infer success from a previous commit.
- Verify Preview deployment corresponds to the exact PR head SHA and is READY.
- Keep Production deployment and merge behind separate owner approvals.
- Exercise a deliberately failing test to prove the workflow blocks a green result.

## Task 4: Eve chat visibility and owner approval
- Surface active sandbox, current command, bounded logs, commit/PR, CI result, and Preview URL in Eve chat.
- Add in-chat owner approval requests backed by the existing authenticated owner session; never let the model self-approve.
- Make Production promotion, merge, payment acceptance, and external actions distinct approval types with exact scope.
- Preserve Owner Console as emergency fallback.

## Task 5: First real product proof
- Assign Eve one small, reversible product task.
- Verify file creation, build/test execution, GitHub PR, passing CI, and Preview deployment at the exact commit.
- Review the working Preview through Eve chat.
- Do not merge, deploy Production, publish, accept payments, or spend money as part of this proof.

## Acceptance criteria
Eve can independently create files in an isolated workspace, run an approved build/test command, capture accurate output and exit status, push changes to a feature branch, open a PR, and report exact-SHA CI and Preview status in her chat. She cannot merge, modify Production, access secrets, spend money, or make external commitments without separate owner approval.