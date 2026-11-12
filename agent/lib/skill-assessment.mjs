const DIMENSIONS = Object.freeze([
  "factualSupport",
  "usefulness",
  "clarity",
  "reproducibility",
  "timeEfficiency",
]);

const REVIEWER_TYPES = new Set(["owner", "independent_reviewer", "automated_test"]);

export function scoreSkillBenchmark(record) {
  if (!record || typeof record !== "object") {
    return { valid: false, reason: "A benchmark record is required." };
  }
  if (typeof record.skill !== "string" || !record.skill.trim() ||
      typeof record.taskId !== "string" || !record.taskId.trim()) {
    return { valid: false, reason: "Skill and task ID are required." };
  }
  if (!REVIEWER_TYPES.has(record.reviewerType)) {
    return { valid: false, reason: "A non-agent reviewer type is required." };
  }
  if (typeof record.evidenceReference !== "string" || !record.evidenceReference.trim() ||
      typeof record.observedResult !== "string" || !record.observedResult.trim()) {
    return { valid: false, reason: "Observed result and evidence reference are required." };
  }
  if (!record.scores || typeof record.scores !== "object" || Array.isArray(record.scores)) {
    return { valid: false, reason: "Dimension scores are required." };
  }

  const missing = DIMENSIONS.filter((dimension) => !Number.isInteger(record.scores[dimension]) ||
    record.scores[dimension] < 1 || record.scores[dimension] > 5);
  if (missing.length) {
    return { valid: false, reason: `Each score must be an integer from 1 to 5: ${missing.join(", ")}.` };
  }

  const total = DIMENSIONS.reduce((sum, dimension) => sum + record.scores[dimension], 0);
  const average = Math.round((total / DIMENSIONS.length) * 100) / 100;
  const meetsThreshold = average >= 4 && DIMENSIONS.every((dimension) => record.scores[dimension] >= 3);

  return {
    valid: true,
    score: average,
    scoreOutOf: 5,
    status: "practiced",
    recommendation: meetsThreshold ? "eligible_for_owner_review" : "needs_more_practice",
    promotionRequiresExplicitOwnerApproval: true,
  };
}

export const SKILL_BENCHMARK_DIMENSIONS = DIMENSIONS;
