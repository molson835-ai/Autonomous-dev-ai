# Eve Artifact Creation and Delivery

## Scope
The first milestone supports one standalone HTML5 file per tool call for small artwork, interactive visual studies, and self-contained documents.

## Lifecycle
1. Eve composes a complete HTML5 document.
2. `create_artifact` validates the name, UTF-8 content, 64 KiB maximum, complete document structure, and responsive viewport.
3. The tool persists the validated, CSP-injected HTML in the existing authenticated Durable Object store; it does not write to a server filesystem or execute HTML.
4. Each logical creation supplies a stable UUID idempotency key. Retrying the same key with identical content returns the original artifact; a conflicting payload returns HTTP 409.
5. The tool returns the artifact UUID and SHA-256 hash. Agent and owner detail reads recompute and verify the hash before returning content.
6. The web chat displays the content in a sandboxed iframe. The verified owner can list, download, or explicitly delete artifacts in the Owner Console.

## Security boundaries
- One file per call; 64 KiB maximum.
- HTML only; external scripts and remote asset URLs are rejected.
- Preview uses an iframe sandbox with scripts only; no same-origin privilege, forms, popups, or top navigation.
- A restrictive Content Security Policy blocks network connections, external assets, forms, frames, and objects.
- No filesystem access, shell, package installation, arbitrary network fetch, automatic execution by Eve, repository writes, commits, PRs, or deployment.
- Durable storage is limited to 20 artifacts and 1 MiB aggregate content; each original HTML file remains limited to 64 KiB.
- Owner list/download/delete routes require verified GitHub-owner authentication and same-origin proxy access.

## Verification limits
The validator checks document structure and policy constraints. The iframe is the actual browser rendering surface. The owner can inspect the live preview; the tool does not claim automated screenshot comparison, browser-console inspection, or cross-browser QA. Those require a separately designed browser-test integration.

## Acceptance test
Ask Eve: "Create an original, colorful, responsive animated artwork as a standalone HTML file. Use inline CSS and JavaScript only." A passing result includes a validated artifact card, visible sandboxed preview at mobile and desktop widths, and a working Download HTML action. A text code block or promise is not a pass.
