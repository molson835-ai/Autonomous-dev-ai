# Eve Artifact Creation and Delivery

## Scope
The first milestone supports one standalone HTML5 file per tool call for small artwork, interactive visual studies, and self-contained documents.

## Lifecycle
1. Eve composes a complete HTML5 document.
2. `create_artifact` validates the name, UTF-8 content, 64 KiB maximum, complete document structure, and responsive viewport.
3. The tool returns an artifact envelope; it does not write to the server filesystem or execute HTML.
4. The web chat displays the content in a sandboxed iframe and provides a browser-side download.
5. The owner can inspect the preview at mobile and desktop widths before downloading.

## Security boundaries
- One file per call; 64 KiB maximum.
- HTML only; external scripts and remote asset URLs are rejected.
- Preview uses an iframe sandbox with scripts only; no same-origin privilege, forms, popups, or top navigation.
- A restrictive Content Security Policy blocks network connections, external assets, forms, frames, and objects.
- No filesystem access, persistence, shell, package installation, network fetch, automatic execution by Eve, repository writes, commits, PRs, or deployment.
- The download is created in the owner's browser from the tool result, not from durable server storage.

## Verification limits
The validator checks document structure and policy constraints. The iframe is the actual browser rendering surface. The owner can inspect the live preview; the tool does not claim automated screenshot comparison, browser-console inspection, or cross-browser QA. Those require a separately designed browser-test integration.

## Acceptance test
Ask Eve: "Create an original, colorful, responsive animated artwork as a standalone HTML file. Use inline CSS and JavaScript only." A passing result includes a validated artifact card, visible sandboxed preview at mobile and desktop widths, and a working Download HTML action. A text code block or promise is not a pass.
