import test from "node:test";
import assert from "node:assert/strict";
import { validateWorkspaceProposal } from "../agent/lib/tool-workspace-policy.mjs";

const file = (path = "agent/tools/example.ts", content = "export const value = 1;") => ({
  path, content, operation: "create",
});

test("accepts bounded new files only in explicitly allowlisted roots", () => {
  const result = validateWorkspaceProposal({ files: [file(), file("tests/example.test.mjs")] });
  assert.equal(result.valid, true);
  assert.equal(result.status, "validated_proposal_only");
  assert.equal(result.limits.filesystemAccess, false);
  assert.equal(result.limits.execution, false);
  assert.equal(result.limits.commitOrPullRequest, false);
});

test("rejects traversal, absolute paths, encoded paths, and backslashes", () => {
  for (const path of ["../escape.ts", "agent/tools/../../escape.ts", "/tmp/escape", "agent/tools/%2e%2e/x", "agent\\tools\\x.ts"]) {
    assert.equal(validateWorkspaceProposal({ files: [file(path)] }).valid, false, path);
  }
});

test("rejects protected roots and sensitive configuration files", () => {
  for (const path of [".github/workflows/ci.yml", "memory/worker/index.ts", "apps/web/app/page.tsx", "agent/tools/.env", "agent/tools/package.json", "docs/../.env"]) {
    assert.equal(validateWorkspaceProposal({ files: [file(path)] }).valid, false, path);
  }
});

test("rejects modifications, deletions, unknown properties, and duplicate paths", () => {
  assert.equal(validateWorkspaceProposal({ files: [{ ...file(), operation: "update" }] }).valid, false);
  assert.equal(validateWorkspaceProposal({ files: [{ ...file(), operation: "delete" }] }).valid, false);
  assert.equal(validateWorkspaceProposal({ files: [{ ...file(), shell: true }] }).valid, false);
  assert.equal(validateWorkspaceProposal({ files: [file(), file()] }).valid, false);
});

test("enforces file count, per-file size, and total size limits", () => {
  assert.equal(validateWorkspaceProposal({ files: Array(6).fill(null).map((_, i) => file(`docs/${i}.md`)) }).valid, false);
  assert.equal(validateWorkspaceProposal({ files: [file("docs/large.md", "x".repeat(32 * 1024 + 1))] }).valid, false);
  assert.equal(validateWorkspaceProposal({ files: [file("docs/a.md", "x".repeat(30 * 1024)), file("docs/b.md", "x".repeat(30 * 1024)), file("docs/c.md", "x".repeat(30 * 1024))] }).valid, false);
});

test("rejects binary-like control characters and malformed proposals", () => {
  assert.equal(validateWorkspaceProposal({ files: [file("docs/binary.txt", "ok\\0bad")] }).valid, false);
  assert.equal(validateWorkspaceProposal({ files: [] }).valid, false);
  assert.equal(validateWorkspaceProposal({ files: [file()], shell: true }).valid, false);
  assert.equal(validateWorkspaceProposal(null).valid, false);
});
