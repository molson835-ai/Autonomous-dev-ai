import assert from "node:assert/strict";
import test from "node:test";
import { planTaskSkills } from "../../agent/planning/task-skill-planner.ts";

const criteria = ["Complete a repeatable test and capture its output."];
const resource = (overrides = {}) => ({
  id: "r-1",
  name: "Approved TypeScript guide",
  summary: "Reference documentation for TypeScript.",
  skill_tags: ["typescript"],
  source_url: "https://www.typescriptlang.org/docs/",
  license: "MIT",
  cost_model: "free_open_source",
  trust_state: "approved",
  ...overrides,
});

test("planner matches normalized tags and accepts evidence only from non-agent reviewers", () => {
  const report = planTaskSkills({
    task: "Build a typed API endpoint",
    requirements: [{ skill: "TypeScript", requiredStatus: "demonstrated", acceptanceCriteria: criteria }],
    skillEvidence: [
      { skill: "typescript", status: "demonstrated", evidenceRefs: ["agent://self-score"], reviewerType: "agent" },
      { skill: "typescript", status: "practiced", evidenceRefs: ["ci://run/123"], reviewerType: "automated_test" },
    ],
    resources: [resource()],
  });

  assert.equal(report.skills[0].skill, "typescript");
  assert.equal(report.skills[0].currentStatus, "practiced");
  assert.equal(report.skills[0].gap, true);
  assert.deepEqual(report.gaps, ["typescript"]);
  assert.equal(report.skills[0].matchingResources[0].executionReady, false);
  assert.equal(report.skills[0].matchingResources[0].reviewRequired, false);
});

test("planner treats absent or agent-only evidence as untested", () => {
  const report = planTaskSkills({
    task: "Research a business service",
    requirements: [{ skill: "market-research", requiredStatus: "practiced", acceptanceCriteria: criteria }],
    skillEvidence: [
      { skill: "market-research", status: "demonstrated", evidenceRefs: ["agent://claim"], reviewerType: "agent" },
    ],
    resources: [],
  });
  assert.equal(report.skills[0].currentStatus, "untested");
  assert.deepEqual(report.gaps, ["market-research"]);
  assert.deepEqual(report.unmatchedSkills, ["market-research"]);
});

test("planner excludes rejected and stale resources and flags unreviewed or unknown-cost entries", () => {
  const report = planTaskSkills({
    task: "Review public research sources",
    requirements: [{ skill: "research", requiredStatus: "untested", acceptanceCriteria: criteria }],
    skillEvidence: [],
    resources: [
      resource({ id: "quarantined", skill_tags: ["research"], trust_state: "quarantined", license: "unknown", cost_model: "unknown" }),
      resource({ id: "paid", skill_tags: ["research"], trust_state: "approved", cost_model: "paid" }),
      resource({ id: "rejected", skill_tags: ["research"], trust_state: "rejected" }),
      resource({ id: "stale", skill_tags: ["research"], trust_state: "stale" }),
    ],
  });
  const matches = report.skills[0].matchingResources;
  assert.deepEqual(matches.map((item) => item.id), ["quarantined", "paid"]);
  assert.equal(matches[0].reviewRequired, true);
  assert.equal(matches[0].licenseKnown, false);
  assert.equal(matches[1].reviewRequired, true);
  assert.equal(matches[1].executionReady, false);
});

test("planner rejects duplicate requirements and malformed acceptance criteria", () => {
  const base = {
    task: "Test task",
    requirements: [
      { skill: "Git", requiredStatus: "practiced", acceptanceCriteria: criteria },
      { skill: " git ", requiredStatus: "practiced", acceptanceCriteria: criteria },
    ],
    skillEvidence: [],
    resources: [],
  };
  assert.throws(() => planTaskSkills(base), /unique/);
  assert.throws(() => planTaskSkills({
    ...base,
    requirements: [{ skill: "git", requiredStatus: "practiced", acceptanceCriteria: [] }],
  }), /acceptance criteria/);
});

test("planner never promotes skills or executes resource actions", () => {
  const report = planTaskSkills({
    task: "Prepare a coding task",
    requirements: [{ skill: "testing", requiredStatus: "demonstrated", acceptanceCriteria: criteria }],
    skillEvidence: [{ skill: "testing", status: "demonstrated", evidenceRefs: ["ci://run/9"], reviewerType: "automated_test" }],
    resources: [resource({ skill_tags: ["testing"] })],
  });
  assert.equal(report.skills[0].currentStatus, "demonstrated");
  assert.equal("promoted" in report.skills[0], false);
  assert.ok(report.limitations.some((item) => item.includes("does not run tests")));
});
