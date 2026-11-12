import test from "node:test";
import assert from "node:assert/strict";
import { scoreSkillBenchmark } from "../agent/lib/skill-assessment.mjs";

const passing = {
  skill: "business-research",
  taskId: "phase-2-report-001",
  reviewerType: "independent_reviewer",
  evidenceReference: "review://phase-2-report-001",
  observedResult: "All material claims matched cited source evidence.",
  scores: {
    factualSupport: 5,
    usefulness: 4,
    clarity: 4,
    reproducibility: 4,
    timeEfficiency: 3,
  },
};

test("scores complete evidence-backed benchmark records", () => {
  const result = scoreSkillBenchmark(passing);
  assert.equal(result.valid, true);
  assert.equal(result.score, 4);
  assert.equal(result.status, "practiced");
  assert.equal(result.recommendation, "eligible_for_owner_review");
  assert.equal(result.promotionRequiresExplicitOwnerApproval, true);
});

test("does not accept the agent as its own reviewer", () => {
  const result = scoreSkillBenchmark({ ...passing, reviewerType: "agent" });
  assert.equal(result.valid, false);
});

test("requires evidence and an observed result", () => {
  assert.equal(scoreSkillBenchmark({ ...passing, evidenceReference: "" }).valid, false);
  assert.equal(scoreSkillBenchmark({ ...passing, observedResult: "" }).valid, false);
});

test("rejects missing, fractional, and out-of-range dimension scores", () => {
  assert.equal(scoreSkillBenchmark({ ...passing, scores: {} }).valid, false);
  assert.equal(scoreSkillBenchmark({
    ...passing, scores: { ...passing.scores, clarity: 4.5 },
  }).valid, false);
  assert.equal(scoreSkillBenchmark({
    ...passing, scores: { ...passing.scores, clarity: 6 },
  }).valid, false);
});

test("a high average cannot hide a severe weakness", () => {
  const result = scoreSkillBenchmark({
    ...passing,
    scores: { ...passing.scores, factualSupport: 2, usefulness: 5 },
  });
  assert.equal(result.valid, true);
  assert.equal(result.recommendation, "needs_more_practice");
});

test("never promotes a skill automatically, even when every score is high", () => {
  const result = scoreSkillBenchmark({
    ...passing,
    reviewerType: "automated_test",
    scores: {
      factualSupport: 5, usefulness: 5, clarity: 5,
      reproducibility: 5, timeEfficiency: 5,
    },
  });
  assert.equal(result.status, "practiced");
  assert.equal(result.promotionRequiresExplicitOwnerApproval, true);
});
