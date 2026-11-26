import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import researchOpportunityEvidence from "../agent/tools/research_opportunity_evidence.ts";

const agentDefinition = readFileSync(new URL("../agent/agent.ts", import.meta.url), "utf8");

test("root Eve agent disables optional framework default tools", () => {
  assert.match(agentDefinition, /defaultTools:\s*false/);
});

test("root Eve agent disables the framework root-copy delegation tool", () => {
  assert.match(agentDefinition, /tool:\s*false/);
});

test("application-authored tools remain present when framework defaults are disabled", () => {
  for (const path of [
    "../agent/tools/research_opportunity_evidence.ts",
    "../agent/tools/research_revenue_opportunity.ts",
    "../agent/tools/research_sources.ts",
    "../agent/tools/search_news.ts",
    "../agent/tools/task_claim_next.ts",
    "../agent/tools/task_transition.ts",
  ]) {
    assert.doesNotThrow(() => readFileSync(new URL(path, import.meta.url), "utf8"), path);
  }
  // The module's default export is the executable definition consumed by Eve's
  // application-tool discovery; checking the file alone would miss a broken export.
  assert.equal(typeof researchOpportunityEvidence.execute, "function");
});
