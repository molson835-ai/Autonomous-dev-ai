const EVIDENCE_TYPES = new Set([
  "public_problem_signal",
  "competitor_signal",
  "direct_buyer_problem_confirmation",
  "stated_willingness_to_pay",
  "completed_user_test",
  "verified_payment",
]);

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validHttpsUrl(value) {
  if (!nonEmpty(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validTimestamp(value) {
  return nonEmpty(value) && ISO_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
}

export function validateRevenueEvidence(evidence) {
  const errors = [];
  if (!Array.isArray(evidence)) {
    return { valid: false, errors: ["evidence_must_be_array"], normalized: [] };
  }
  if (evidence.length > 100) errors.push("evidence_limit_exceeded");

  const ids = new Set();
  const normalized = [];
  for (const [index, item] of evidence.slice(0, 100).entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`evidence_${index}_must_be_object`);
      continue;
    }
    if (!nonEmpty(item.id) || ids.has(item.id)) errors.push(`evidence_${index}_invalid_or_duplicate_id`);
    else ids.add(item.id);
    if (!EVIDENCE_TYPES.has(item.type)) errors.push(`evidence_${index}_invalid_type`);
    if (!nonEmpty(item.statement)) errors.push(`evidence_${index}_missing_statement`);
    if (!validTimestamp(item.observedAt)) errors.push(`evidence_${index}_invalid_observed_at`);
    if (item.type === "public_problem_signal" || item.type === "competitor_signal") {
      if (!validHttpsUrl(item.sourceUrl)) errors.push(`evidence_${index}_requires_https_source`);
    }
    if (item.type === "verified_payment") {
      if (item.independentlyVerified !== true) errors.push(`evidence_${index}_payment_not_independently_verified`);
      if (typeof item.amount !== "number" || !Number.isFinite(item.amount) || item.amount <= 0) {
        errors.push(`evidence_${index}_invalid_payment_amount`);
      }
      if (!nonEmpty(item.currency) || !/^[A-Z]{3}$/.test(item.currency)) {
        errors.push(`evidence_${index}_invalid_currency`);
      }
      if (!nonEmpty(item.verificationRef)) errors.push(`evidence_${index}_missing_verification_reference`);
    }
    normalized.push({
      id: typeof item.id === "string" ? item.id.trim() : "",
      type: item.type,
      statement: typeof item.statement === "string" ? item.statement.trim() : "",
      observedAt: item.observedAt,
      ...(validHttpsUrl(item.sourceUrl) ? { sourceUrl: item.sourceUrl } : {}),
      ...(item.type === "verified_payment" ? {
        amount: item.amount,
        currency: item.currency,
        independentlyVerified: item.independentlyVerified === true,
        verificationRef: item.verificationRef,
      } : {}),
    });
  }
  return { valid: errors.length === 0, errors, normalized };
}

export function assessRevenueExperiment({ evidence, acceptanceCriteria = [] } = {}) {
  const checked = validateRevenueEvidence(evidence);
  const items = checked.normalized;
  const count = type => items.filter(item => item.type === type).length;
  const paymentEvidence = items.filter(item => item.type === "verified_payment" && item.independentlyVerified);
  const status = !checked.valid
    ? "invalid_evidence"
    : paymentEvidence.length > 0
      ? "verified_payment_recorded"
      : count("completed_user_test") > 0
        ? "user_test_completed"
        : count("direct_buyer_problem_confirmation") > 0
          ? "buyer_problem_confirmed"
          : count("public_problem_signal") > 0
            ? "problem_signals_only"
            : "unvalidated";

  return {
    valid: checked.valid,
    errors: checked.errors,
    status,
    evidenceCounts: {
      publicProblemSignals: count("public_problem_signal"),
      competitorSignals: count("competitor_signal"),
      directBuyerProblemConfirmations: count("direct_buyer_problem_confirmation"),
      statedWillingnessToPay: count("stated_willingness_to_pay"),
      completedUserTests: count("completed_user_test"),
      verifiedPayments: paymentEvidence.length,
    },
    verifiedPayments: paymentEvidence.map(({ amount, currency, verificationRef, observedAt }) => ({
      amount, currency, verificationRef, observedAt,
    })),
    acceptanceCriteriaCount: Array.isArray(acceptanceCriteria) ? acceptanceCriteria.length : 0,
    revenueForecast: null,
    note: "Evidence classification is not proof of market size, profitability, repeatability, or future revenue. A payment is counted only when independently verified with a positive amount, ISO currency, and verification reference.",
  };
}
