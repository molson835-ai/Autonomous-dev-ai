import assert from "node:assert/strict";
import test from "node:test";
import { planTaskSkills } from "../../agent/planning/task-skill-planner.ts";
import { prepareResourceCandidate } from "../../agent/resources/intake.mjs";

const base = {
  id: "test.resource", name: "Test resource", summary: "Test metadata", resource_type: "documentation",
  skill_tags: ["testing"], source_url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
};

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
  assert.equal(report.skills[0].matchingResources[0].reviewRequired, true);
  assert.equal(report.skills[0].matchingResources[0].commercialUse, "unknown");
  assert.equal(report.skills[0].matchingResources[0].adapterStatus, "candidate");
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
      resource({ id: "limited", skill_tags: ["research"], trust_state: "approved", cost_model: "free_tier_limited" }),
      resource({ id: "rejected", skill_tags: ["research"], trust_state: "rejected" }),
      resource({ id: "stale", skill_tags: ["research"], trust_state: "stale" }),
    ],
  });
  const matches = report.skills[0].matchingResources;
  assert.deepEqual(matches.map((item) => item.id), ["quarantined", "paid", "limited"]);
  assert.equal(matches[0].reviewRequired, true);
  assert.equal(matches[0].licenseKnown, false);
  assert.equal(matches[1].reviewRequired, true);
  assert.equal(matches[1].executionReady, false);
  assert.equal(matches[2].reviewRequired, true);
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


test("planner requires current commercial, quota, and adapter evidence before marking a resource review-complete", () => {
  const reviewedResource = resource({
    maintainer: "TypeScript maintainers",
    version_or_revision: "current-docs",
    security_notes: "Read-only public documentation; no code execution.",
    cost_notes: "Open-source documentation; no provider account or paid quota required.",
    freshness_policy: "Recheck official documentation at least every 90 days.",
    dependencies: [],
    permissions: [],
    network_or_execution_requirements: ["Public HTTPS read only."],
    last_verified_at: "2026-11-25T00:00:00.000Z",
    retrieved_at: "2026-11-25T00:00:00.000Z",
    access_mode: "public_read",
    persistence: "durable",
    execution: "none",
    data_classes_allowed: ["public"],
    commercial_use: "allowed",
    quota_evidence: {
      source_url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
      checked_at: "2026-11-23T00:00:00.000Z",
      limits: "No account quota applies to this open-source documentation.",
      confidence: "high",
    },
    adapter_status: "tested",
    failure_policy: "manual_review",
    deletion_and_export: "No user data stored by the reference site.",
  });
  const report = planTaskSkills({
    task: "Use a verified research reference",
    requirements: [{ skill: "typescript", requiredStatus: "untested", acceptanceCriteria: criteria }],
    skillEvidence: [],
    resources: [reviewedResource],
  });
  const selected = report.skills[0].matchingResources[0];
  assert.equal(selected.reviewRequired, false);
  assert.equal(selected.executionReady, false);
  assert.equal(selected.commercialUse, "allowed");
  assert.equal(selected.adapterStatus, "tested");
  assert.equal(selected.accessMode, "public_read");
  assert.deepEqual(selected.missingReviewEvidence, []);
  assert.equal(selected.maintainer, "TypeScript maintainers");
  assert.equal(selected.revision, "current-docs");
});

test("planner flags conditional commercial use, stale quota confidence, and non-public access", () => {
  const report = planTaskSkills({
    task: "Choose a resource",
    requirements: [{ skill: "typescript", requiredStatus: "untested", acceptanceCriteria: criteria }],
    skillEvidence: [],
    resources: [resource({
      access_mode: "authenticated_read",
      commercial_use: "conditional",
      quota_evidence: {
        source_url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
        checked_at: "2026-11-23T00:00:00.000Z",
        limits: "Unknown",
        confidence: "low",
      },
      adapter_status: "enabled",
    })],
  });
  assert.equal(report.skills[0].matchingResources[0].reviewRequired, true);
  assert.ok(report.skills[0].matchingResources[0].missingReviewEvidence.includes("quota_evidence"));
  assert.ok(report.skills[0].matchingResources[0].missingReviewEvidence.includes("persistence"));
});

test("intake does not accept high-confidence quota claims without dated official evidence", () => {
  assert.throws(() => prepareResourceCandidate({
    ...base,
    quota_evidence: { source_url: "unknown", checked_at: "unknown", limits: "unknown", confidence: "high" }
  }), /High-confidence quota evidence/);
});
