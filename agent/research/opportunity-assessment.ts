export type OpportunitySourceKind = "primary" | "official" | "marketplace" | "news" | "community" | "secondary";

export interface SourceObservation {
  id: string;
  statement: string;
  sourceTitle: string;
  sourceUrl: string;
  sourceKind: OpportunitySourceKind;
  accessedAt: string;
  publishedAt?: string;
}
export interface OpportunityHypothesis { id: string; statement: string; basisObservationIds: string[]; }
export interface OpportunityRecommendation { action: string; basisObservationIds: string[]; assumptions: string[]; }
export interface OpportunityAssessmentInput {
  researchQuestion: string; targetBuyer: string; problemStatement: string;
  sourceObservations: SourceObservation[]; hypotheses: OpportunityHypothesis[];
  unknowns: string[]; recommendations: OpportunityRecommendation[];
}
export interface OpportunityAssessment extends OpportunityAssessmentInput {
  evidenceCoverage: { observationCount: number; distinctSourceHostCount: number; sourceHostnames: string[]; coverage: "none" | "single_host" | "multiple_hosts"; };
  limitations: string[];
  permissions: { mayContactProspects: false; mayPublishOffers: false; mayAcceptPayments: false; maySpendMoney: false; };
}
const MAX_OBSERVATIONS = 20;
const MAX_HYPOTHESES = 20;
const MAX_UNKNOWNS = 20;
const MAX_RECOMMENDATIONS = 10;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
function boundedText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new Error(field + " must be text");
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new Error(field + " must contain 1 to " + max + " characters");
  return normalized;
}
function timestamp(value: unknown, field: string): string {
  const normalized = boundedText(value, field, 40);
  if (!RFC3339.test(normalized) || !Number.isFinite(Date.parse(normalized))) throw new Error(field + " must be a valid RFC3339 timestamp with timezone");
  return normalized;
}
function sourceUrl(value: unknown): { url: string; hostname: string } {
  const raw = boundedText(value, "sourceUrl", 2000);
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error("sourceUrl must be a valid HTTPS URL"); }
  if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) throw new Error("sourceUrl must be HTTPS and must not contain credentials");
  parsed.hash = "";
  return { url: parsed.toString(), hostname: parsed.hostname.toLowerCase() };
}
function stringList(values: unknown, field: string, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(values) || values.length > maxItems) throw new Error(field + " must be an array with at most " + maxItems + " entries");
  const normalized = values.map((value) => boundedText(value, field + " entry", maxLength));
  if (new Set(normalized).size !== normalized.length) throw new Error(field + " entries must be distinct");
  return normalized;
}
/** Builds a bounded draft assessment. It validates structure and URL/timestamp syntax only; it does not fetch sources, verify claims, or establish demand. */
export function buildOpportunityAssessment(input: OpportunityAssessmentInput): OpportunityAssessment {
  if (!input || typeof input !== "object") throw new Error("Assessment input is required");
  const researchQuestion = boundedText(input.researchQuestion, "researchQuestion", 500);
  const targetBuyer = boundedText(input.targetBuyer, "targetBuyer", 300);
  const problemStatement = boundedText(input.problemStatement, "problemStatement", 1200);
  if (!Array.isArray(input.sourceObservations) || input.sourceObservations.length > MAX_OBSERVATIONS) throw new Error("sourceObservations must contain at most " + MAX_OBSERVATIONS + " entries");
  if (!Array.isArray(input.hypotheses) || input.hypotheses.length > MAX_HYPOTHESES) throw new Error("hypotheses must contain at most " + MAX_HYPOTHESES + " entries");
  if (!Array.isArray(input.recommendations) || input.recommendations.length > MAX_RECOMMENDATIONS) throw new Error("recommendations must contain at most " + MAX_RECOMMENDATIONS + " entries");
  const observationIds = new Set<string>();
  const seenUrls = new Set<string>();
  const hosts = new Set<string>();
  const sourceObservations = input.sourceObservations.map((observation) => {
    const id = boundedText(observation?.id, "observation id", 80);
    if (observationIds.has(id)) throw new Error("Observation IDs must be unique");
    observationIds.add(id);
    const parsedSource = sourceUrl(observation?.sourceUrl);
    if (seenUrls.has(parsedSource.url)) throw new Error("Duplicate source URLs do not count as separate observations");
    seenUrls.add(parsedSource.url);
    hosts.add(parsedSource.hostname);
    const sourceKind = observation?.sourceKind;
    if (!["primary", "official", "marketplace", "news", "community", "secondary"].includes(sourceKind)) throw new Error("Unsupported sourceKind");
    const publishedAt = observation?.publishedAt === undefined ? undefined : timestamp(observation.publishedAt, "publishedAt");
    return {
      id, statement: boundedText(observation?.statement, "observation statement", 1200),
      sourceTitle: boundedText(observation?.sourceTitle, "sourceTitle", 300),
      sourceUrl: parsedSource.url, sourceKind,
      accessedAt: timestamp(observation?.accessedAt, "accessedAt"),
      ...(publishedAt ? { publishedAt } : {}),
    };
  });
  const hypothesesIds = new Set<string>();
  const hypotheses = input.hypotheses.map((hypothesis) => {
    const id = boundedText(hypothesis?.id, "hypothesis id", 80);
    if (hypothesesIds.has(id)) throw new Error("Hypothesis IDs must be unique");
    hypothesesIds.add(id);
    const basisObservationIds = stringList(hypothesis?.basisObservationIds, "basisObservationIds", MAX_OBSERVATIONS, 80);
    if (basisObservationIds.some((ref) => !observationIds.has(ref))) throw new Error("Hypothesis references must point to supplied observation IDs");
    return { id, statement: boundedText(hypothesis?.statement, "hypothesis statement", 1200), basisObservationIds };
  });
  const unknowns = stringList(input.unknowns, "unknowns", MAX_UNKNOWNS, 500);
  const recommendations = input.recommendations.map((recommendation) => {
    const basisObservationIds = stringList(recommendation?.basisObservationIds, "recommendation basisObservationIds", MAX_OBSERVATIONS, 80);
    if (basisObservationIds.some((ref) => !observationIds.has(ref))) throw new Error("Recommendation references must point to supplied observation IDs");
    return { action: boundedText(recommendation?.action, "recommendation action", 800), basisObservationIds, assumptions: stringList(recommendation?.assumptions, "recommendation assumptions", 10, 500) };
  });
  const sourceHostnames = [...hosts].sort();
  const coverage = sourceHostnames.length === 0 ? "none" : sourceHostnames.length === 1 ? "single_host" : "multiple_hosts";
  return {
    researchQuestion, targetBuyer, problemStatement, sourceObservations, hypotheses, unknowns, recommendations,
    evidenceCoverage: { observationCount: sourceObservations.length, distinctSourceHostCount: sourceHostnames.length, sourceHostnames, coverage },
    limitations: [
      "Source URLs and timestamps are syntax-checked only; this helper does not fetch pages or verify their contents.",
      "Source-attributed observations are not independently verified facts.",
      "Different hostnames do not prove independent ownership, reporting, or evidence.",
      "Hypotheses, unknowns, and recommendations are supplied analysis, not established market demand.",
      "This assessment does not forecast sales, conversion, revenue, or profit.",
      "No outreach, publication, payment acceptance, spending, or purchase is authorized.",
    ],
    permissions: { mayContactProspects: false, mayPublishOffers: false, mayAcceptPayments: false, maySpendMoney: false },
  };
}
