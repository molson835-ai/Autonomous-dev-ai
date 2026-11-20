import assert from "node:assert/strict";
import test from "node:test";
import { buildOpportunityAssessment } from "../../agent/research/opportunity-assessment.ts";
const base = {
  researchQuestion: "Do independent repair shops need a simple parts lookup service?",
  targetBuyer: "Independent automotive repair shops",
  problemStatement: "Technicians may spend time identifying compatible replacement parts.",
  sourceObservations: [
    { id: "obs-1", statement: "A repair forum discussion describes delays finding compatible parts.", sourceTitle: "Repair shop discussion", sourceUrl: "https://forum.example.org/thread/123#reply", sourceKind: "community", accessedAt: "2026-11-20T12:00:00Z", publishedAt: "2026-11-18T09:30:00Z" },
    { id: "obs-2", statement: "A parts marketplace lists compatibility lookup as a product feature.", sourceTitle: "Parts marketplace feature page", sourceUrl: "https://market.example.com/features/lookup", sourceKind: "marketplace", accessedAt: "2026-11-20T12:05:00Z" },
  ],
  hypotheses: [
    { id: "hyp-1", statement: "A focused cross-catalog lookup may save technicians time.", basisObservationIds: ["obs-1", "obs-2"] },
    { id: "hyp-2", statement: "A subset of small shops may prefer a simpler workflow.", basisObservationIds: [] },
  ],
  unknowns: ["How often does this problem occur?", "Would shops pay for a solution?"],
  recommendations: [{ action: "Compare existing lookup workflows and document gaps.", basisObservationIds: ["obs-1", "obs-2"], assumptions: ["Public product descriptions accurately reflect current features."] }],
};
test("keeps observations, hypotheses, unknowns, and recommendations separate", () => {
  const result = buildOpportunityAssessment(base);
  assert.equal(result.sourceObservations.length, 2);
  assert.equal(result.hypotheses.length, 2);
  assert.equal(result.unknowns.length, 2);
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.evidenceCoverage.coverage, "multiple_hosts");
  assert.equal(result.evidenceCoverage.distinctSourceHostCount, 2);
  assert.equal(result.sourceObservations[0].sourceUrl, "https://forum.example.org/thread/123");
  assert.equal(result.permissions.mayContactProspects, false);
  assert.equal(result.permissions.mayPublishOffers, false);
  assert.equal(result.permissions.mayAcceptPayments, false);
  assert.equal(result.permissions.maySpendMoney, false);
  assert.match(result.limitations.join(" "), /does not fetch pages or verify/);
});
test("does not describe observations as verified facts or hostnames as independent sources", () => {
  const result = buildOpportunityAssessment(base);
  assert.match(result.limitations.join(" "), /not independently verified facts/);
  assert.match(result.limitations.join(" "), /do not prove independent ownership/);
});
test("allows an empty research record without inventing evidence", () => {
  const result = buildOpportunityAssessment({ ...base, sourceObservations: [], hypotheses: [{ id: "h1", statement: "This may be a problem.", basisObservationIds: [] }], recommendations: [{ action: "Gather evidence.", basisObservationIds: [], assumptions: [] }] });
  assert.equal(result.evidenceCoverage.coverage, "none");
  assert.equal(result.evidenceCoverage.observationCount, 0);
});
test("rejects non-HTTPS URLs and URLs containing credentials", () => {
  for (const sourceUrl of ["http://example.com/a", "javascript:alert(1)", "https://user:pass@example.com/a"]) {
    assert.throws(() => buildOpportunityAssessment({ ...base, sourceObservations: [{ ...base.sourceObservations[0], sourceUrl }] }), /HTTPS/);
  }
});
test("rejects duplicate observation IDs and duplicate source URLs", () => {
  assert.throws(() => buildOpportunityAssessment({ ...base, sourceObservations: [base.sourceObservations[0], { ...base.sourceObservations[1], id: "obs-1" }] }), /IDs must be unique/);
  assert.throws(() => buildOpportunityAssessment({ ...base, sourceObservations: [base.sourceObservations[0], { ...base.sourceObservations[1], sourceUrl: base.sourceObservations[0].sourceUrl }] }), /Duplicate source URLs/);
});
test("rejects references to observations that are not present", () => {
  assert.throws(() => buildOpportunityAssessment({ ...base, hypotheses: [{ id: "hyp-1", statement: "Unsupported link.", basisObservationIds: ["missing"] }] }), /must point to supplied observation IDs/);
  assert.throws(() => buildOpportunityAssessment({ ...base, recommendations: [{ action: "Unsupported link.", basisObservationIds: ["missing"], assumptions: [] }] }), /must point to supplied observation IDs/);
});
test("requires timezone-qualified RFC3339 timestamps", () => {
  assert.throws(() => buildOpportunityAssessment({ ...base, sourceObservations: [{ ...base.sourceObservations[0], accessedAt: "2026-11-20 12:00:00" }] }), /valid RFC3339 timestamp with timezone/);
});
test("enforces collection and text bounds", () => {
  assert.throws(() => buildOpportunityAssessment({ ...base, sourceObservations: Array(21).fill(base.sourceObservations[0]).map((item, i) => ({ ...item, id: "id-" + i, sourceUrl: "https://example.com/" + i })) }), /at most 20/);
  assert.throws(() => buildOpportunityAssessment({ ...base, researchQuestion: " " }), /researchQuestion/);
  assert.throws(() => buildOpportunityAssessment({ ...base, unknowns: Array(21).fill("unknown") }), /at most 20/);
});
