# Eve eBay inventory audit project write access

## Purpose

This capability lets Eve independently maintain the designated local-first product in `products/ebay-inventory-audit/`. It is not general repository access and does not grant ownership over other projects or agent infrastructure.

## Fixed scope

- Repository: `molson835-ai/Autonomous-dev-AI`
- Branch prefix: `eve/ebay-inventory-audit/`
- Writable path prefix: `products/ebay-inventory-audit/`
- Allowed text extensions: HTML, MJS, JS, CSS, JSON, Markdown, CSV, TXT, and SVG.
- Maximum single file: 64 KiB.
- Maximum API response: 1 MB.
- API timeout: 10 seconds.
- New branches must start from the exact current `main` SHA supplied by the caller.
- Each file write requires the exact expected branch-head SHA.
- Pull requests target `main` and are always created as drafts.

## Supported actions

### create_branch

Creates one branch only when its name matches `eve/ebay-inventory-audit/<lowercase-slug>` and the supplied expected base SHA exactly matches current `main`. Existing branches fail closed.

### write_file

Creates or replaces one regular text file under the fixed product directory. The caller supplies the expected branch-head SHA. The implementation creates a Git blob, tree, and commit whose sole parent is that expected SHA, then attempts a non-force ref update. If another actor moves the branch before the update, GitHub rejects the non-fast-forward update; the tool does not force-push or retry. File deletion, symlinks, arbitrary paths, and binary extensions are not supported.

### open_pull_request

Checks that the branch head still matches the expected SHA, compares it with `main`, and verifies that every returned changed filename is within the fixed product directory. It rejects empty, incomplete, or 300-file compare results. It creates a draft PR to `main` with maintainer edits disabled. The tool cannot approve, merge, or deploy the PR.

## Credential

The runtime reads one environment secret named `EVE_GITHUB_REPO_TOKEN`. It is not embedded in source, included in prompts, returned from the tool, or written to logs. The tool fails closed when the secret is absent.

The PAT should be limited to this repository with Contents read/write, Pull requests read/write, and Metadata read-only. Do not grant Administration, Actions write, Secrets, Workflows, or organization permissions. The GitHub token itself is repository-wide; path and branch restrictions are enforced by the Eve tool, not by the PAT. Keep the token private and rotate/revoke it if exposure is suspected.

**Credential status at implementation time:** no PAT has been added to Vercel or otherwise connected to Eve. Merging this code alone does not enable writes. The secret must be added by the owner as a separate explicit step before a live acceptance test.

## Authorization and remaining owner controls

The tool is dynamically gated by the existing `canUseWriteTools` authorization policy and is unavailable in Preview/local deployments or explicitly read-only turns. It cannot be invoked by anonymous chat. Scheduled use requires the existing owner-approved work-loop identity.

Eve may independently research, plan, create project branches, write files within the project directory, run CI tests, debug, revise, document, and open draft PRs for this project. Owner approval remains required for:
- merging any PR into `main`;
- production deployment;
- adding or changing credentials, accounts, security settings, or authorization scope;
- paid services, purchases, trials, metered fallback, or use of personal funds;
- customer outreach, messaging, publication outside the repository, external commitments, or payment handling;
- persistent Production memory writes/proposals;
- changes outside this designated product scope.

No shell, general filesystem, arbitrary GitHub API, branch deletion, force push, main-branch write, merge, deployment, customer communication, or payment capability is added.

## Verification

Automated tests cover fixed repository/host behavior, missing credentials, branch-prefix and path enforcement, traversal and extension rejection, expected-SHA concurrency checks, non-force updates, draft-only PR creation, and rejection of PR diffs containing paths outside the product directory.

A green CI run verifies the source and tests. It does not prove the secret is configured, the deployed Eve runtime has loaded the tool, or that the GitHub token works. Those require a separately approved credential-connection step and a bounded live test.
