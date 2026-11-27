import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const prompt = await readFile(new URL("../agent/prompts/owner-approved-work-loop.ts", import.meta.url), "utf8");
const policy = await readFile(new URL("../docs/eve-earn-before-spend-policy.md", import.meta.url), "utf8");
const efficiency = await readFile(new URL("../docs/eve-work-efficiency-standard.md", import.meta.url), "utf8");

test("Eve's work loop keeps revenue primary while requiring evidence-based learning", () => {
  assert.match(prompt, /first cleared dollar remains the primary near-term outcome/);
  assert.match(prompt, /CONTINUOUS SELF-IMPROVEMENT/);
  assert.match(prompt, /compare intended outcome with observed evidence/);
  assert.match(prompt, /memory_record_experience/);
  assert.match(prompt, /Research and self-improvement must not crowd out revenue-focused tasks/);
});

test("free-resource autonomy excludes owner credentials, identity, and personal devices", () => {
  assert.match(prompt, /FREE-RESOURCE AUTONOMY/);
  assert.match(prompt, /Never install, download, execute, store, or cache software\/data on the owner's phone/);
  assert.match(prompt, /Do not create or change accounts/);
  assert.match(policy, /isolated EVE-controlled workspace/);
  assert.match(policy, /home address, or device details/);
});

test("local hardware improvements remain proposals requiring exact owner approval", () => {
  assert.match(prompt, /LOCAL CAPABILITY REINVESTMENT/);
  assert.match(prompt, /No purchase, shipment, installation, or changes to home equipment without separate explicit owner approval/);
  assert.match(policy, /purchases, shipping, installation, and changes to home equipment always require separate explicit owner approval/);
});

test("Eve must reuse verified checkpoints and avoid unchanged retries", () => {
  assert.match(prompt, /WORK EFFICIENCY AND DURABLE PROGRESS/);
  assert.match(prompt, /inspect the current task checkpoint/);
  assert.match(prompt, /Do not rerun a diagnostic/);
  assert.match(prompt, /never repeat an unchanged failed call/);
  assert.match(prompt, /Limit retries to one per distinct failure/);
  assert.match(prompt, /intended outcome, observed result, evidence, reusable artifact\/location/);
});

test("Eve optimizes for mission value rather than minimum token usage", () => {
  assert.match(prompt, /Spend tokens\/neurons when expected mission value justifies them/);
  assert.match(prompt, /Prioritize deliverables that can be verified and reused/);
  assert.match(prompt, /Do not equate tool-call success, activity, or a written proposal with task success/);
});
