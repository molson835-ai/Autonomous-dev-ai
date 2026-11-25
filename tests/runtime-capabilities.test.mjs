import test from "node:test";
import assert from "node:assert/strict";
import { projectRuntimeCapabilities } from "../apps/web/lib/runtime-capabilities.mjs";

test("projects static tools and dynamic resolvers as distinct capability types", () => {
  const report = projectRuntimeCapabilities({
    agent: { name: "Eve", model: { id: "test-model" } },
    version: 5,
    tools: {
      static: [
        { name: "task_list", logicalPath: "agent/tools/task_list.ts", sourceKind: "module", owner: { kind: "application" }, hasExecute: true, requiresApproval: false, hasAuth: false },
      ],
      dynamic: [
        { slug: "dynamic-research", logicalPath: "agent/tools/research.ts", sourceKind: "module", owner: { kind: "application" } },
      ],
    },
    composition: { disabled: [], shadowed: [] },
    diagnostics: { discoveryErrors: 0, discoveryWarnings: 1 },
  }, { checkedAt: "2026-11-24T00:00:00.000Z", environment: "production" });

  assert.equal(report.agent_name, "Eve");
  assert.equal(report.manifest_scope, "compiled-deployment-definitions");
  assert.deepEqual(report.static_tools.map(tool => tool.name), ["task_list"]);
  assert.equal(report.static_tools[0].has_execute, true);
  assert.deepEqual(report.dynamic_tool_resolvers.map(item => item.slug), ["dynamic-research"]);
  assert.equal(report.discovery_errors, 0);
  assert.equal(report.discovery_warnings, 1);
});

test("does not expose instructions, schemas, source contents, or credentials", () => {
  const report = projectRuntimeCapabilities({
    agent: { name: "Eve", model: { id: "test-model" } },
    version: 5,
    instructions: { static: [{ content: "PRIVATE PROMPT CONTENT" }] },
    tools: { static: [{
      name: "safe_tool",
      logicalPath: "agent/tools/safe_tool.ts",
      sourceKind: "module",
      owner: { kind: "application" },
      hasExecute: true,
      requiresApproval: true,
      hasAuth: false,
      inputSchema: { secret: "PRIVATE SCHEMA" },
      description: "PRIVATE TOOL DESCRIPTION",
    }], dynamic: [] },
    composition: { disabled: [{ logicalPath: "agent/tools/disabled.ts" }], shadowed: [] },
  });
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("PRIVATE PROMPT CONTENT"), false);
  assert.equal(serialized.includes("PRIVATE SCHEMA"), false);
  assert.equal(serialized.includes("PRIVATE TOOL DESCRIPTION"), false);
  assert.equal(serialized.includes("secret"), false);
  assert.deepEqual(report.disabled_definitions, ["agent/tools/disabled.ts"]);
});

test("reports limitations rather than claiming per-session callability", () => {
  const report = projectRuntimeCapabilities({ tools: { static: [], dynamic: [] } });
  assert.match(report.limitations.join(" "), /not a per-turn effective tool list/);
  assert.match(report.limitations.join(" "), /safe live invocation/);
});
