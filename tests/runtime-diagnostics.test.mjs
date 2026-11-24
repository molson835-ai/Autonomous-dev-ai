import test from "node:test";
import assert from "node:assert/strict";
import {
  SOURCE_DEFINED_TOOL_NAMES,
  DYNAMICALLY_GATED_TOOL_NAMES,
  buildRuntimeDiagnostic,
} from "../agent/lib/runtime-diagnostics.mjs";

test("source inventory is explicit and contains unique tool names", () => {
  assert.equal(SOURCE_DEFINED_TOOL_NAMES.length, 23);
  assert.equal(new Set(SOURCE_DEFINED_TOOL_NAMES).size, SOURCE_DEFINED_TOOL_NAMES.length);
  assert.ok(SOURCE_DEFINED_TOOL_NAMES.includes("runtime_diagnostics"));
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
