import test from "node:test";
import assert from "node:assert/strict";
import { validateHtmlArtifact } from "../agent/lib/artifact-policy.mjs";

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test</title></head><body><main>Hello</main><script>document.body.dataset.ready = "yes";</script></body></html>`;

test("accepts a complete responsive standalone HTML document and returns a download artifact", () => {
  const result = validateHtmlArtifact({ name: "My Artwork!", content: html });
  assert.equal(result.valid, true);
  assert.equal(result.status, "artifact_validated_not_executed");
  assert.equal(result.artifact.filename, "My-Artwork.html");
  assert.equal(result.artifact.mediaType, "text/html");
  assert.match(result.artifact.previewHtml, /Content-Security-Policy/);
  assert.equal(result.limits.serverFilesystem, false);
  assert.equal(result.limits.codeExecutionByAgent, false);
});
test("rejects incomplete documents instead of returning a broken download", () => {
  for (const content of ["<html><body>unfinished", html.slice(0, -7), "<!doctype html><html><head></head><body></body></html>"]) assert.equal(validateHtmlArtifact({ name: "broken", content }).valid, false);
});
test("rejects external scripts and remote assets", () => {
  assert.equal(validateHtmlArtifact({ name: "remote", content: html.replace("</head>", '<script src="https://example.com/a.js"></script></head>') }).valid, false);
  assert.equal(validateHtmlArtifact({ name: "remote", content: html.replace("</body>", '<img src="https://example.com/a.png"></body>') }).valid, false);
});
test("enforces size, name, control-character, and strict input limits", () => {
  assert.equal(validateHtmlArtifact({ name: "x", content: html + "x".repeat(64 * 1024) }).valid, false);
  assert.equal(validateHtmlArtifact({ name: "", content: html }).valid, false);
  assert.equal(validateHtmlArtifact({ name: "x", content: html + "\0" }).valid, false);
  assert.equal(validateHtmlArtifact({ name: "x", content: html, shell: "true" }).valid, false);
  assert.equal(validateHtmlArtifact(null).valid, false);
});
