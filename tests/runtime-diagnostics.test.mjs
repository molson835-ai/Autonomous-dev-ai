import test from "node:test";
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import {
  SOURCE_DEFINED_TOOL_NAMES,
  DYNAMICALLY_GATED_TOOL_NAMES,
  buildRuntimeDiagnostic,
  latestUserMessage,
} from "../agent/lib/runtime-diagnostics.mjs";

test("latest user message excludes prior read-only instructions", () => {
  const messages = [
    { role: "user", content: "This is read-only; do not write." },
    { role: "assistant", content: "Understood." },
    { role: "user", content: "Now continue with the approved task." },
  ];
  assert.deepEqual(latestUserMessage(messages), messages[2]);
  assert.equal(latestUserMessage([{ role: "assistant", content: "No user input" }]), null);
});

test("source inventory is explicit and contains unique tool names", () => {
  assert.equal(SOURCE_DEFINED_TOOL_NAMES.length, 28);
  assert.equal(new Set(SOURCE_DEFINED_TOOL_NAMES).size, SOURCE_DEFINED_TOOL_NAMES.length);
  assert.ok(SOURCE_DEFINED_TOOL_NAMES.includes("runtime_diagnostics"));
  assert.ok(SOURCE_DEFINED_TOOL_NAMES.includes("get_artifact"));
  assert.ok(SOURCE_DEFINED_TOOL_NAMES.includes("repository_readonly"));
});

test("source inventory exactly matches the tool modules in agent/tools", async () => {
  const entries = await readdir(new URL("../agent/tools/", import.meta.url), { withFileTypes: true });
  const toolModules = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => entry.name.slice(0, -3))
    .sort();
  assert.deepEqual([...SOURCE_DEFINED_TOOL_NAMES].sort(), toolModules);
  assert.ok(toolModules.includes("data_workbench"));
});

test("the diagnostic never returns owner or caller identifiers", () => {
  const result = buildRuntimeDiagnostic({
    principal: {
      authenticator: "github-owner",
      issuer: "github",
      principalType: "user",
      principalId: "sensitive-owner-id",
      attributes: { role: "owner" },
    },
    ownerGithubId: "sensitive-owner-id",
    vercelEnv: "production",
    readOnlyTurn: true,
    writeToolsAllowed: false,
    toolName: "runtime_diagnostics",
  });
  assert.equal(result.identity.verifiedGithubOwner, true);
  assert.equal(result.identity.principalId, "[redacted]");
  assert.equal(JSON.stringify(result).includes("sensitive-owner-id"), false);
  assert.equal(JSON.stringify(result).includes("ownerGithubId"), false);
});

test("anonymous and non-owner principals are not reported as verified owners", () => {
  for (const principal of [null, {
    authenticator: "vercel-oidc",
    principalType: "service",
    principalId: "service-id",
  }]) {
    const result = buildRuntimeDiagnostic({
      principal,
      ownerGithubId: "owner-id",
      vercelEnv: "production",
      readOnlyTurn: false,
      writeToolsAllowed: false,
      toolName: "runtime_diagnostics",
    });
    assert.equal(result.identity.verifiedGithubOwner, false);
  }
});

test("read-only sessions report gated tools withheld and never claim runtime enumeration", () => {
  const result = buildRuntimeDiagnostic({
    principal: { authenticator: "github-owner", principalType: "user", principalId: "owner-id" },
    ownerGithubId: "owner-id",
    vercelEnv: "production",
    readOnlyTurn: true,
    writeToolsAllowed: false,
    toolName: "runtime_diagnostics",
  });
  assert.equal(result.permissions.statefulToolsAllowedForThisTurn, false);
  assert.ok(result.permissions.dynamicallyGatedTools.every(item => item.status === "withheld-by-gate"));
  assert.equal(result.inventory.effectiveRuntimeToolManifest, "unavailable-through-documented-ToolContext");
  assert.equal(result.integrations.status, "not-tested");
  assert.equal(DYNAMICALLY_GATED_TOOL_NAMES.length, 9);
});
