export const CAPABILITY_DIMENSIONS = [
  "research",
  "reasoning",
  "coding",
  "memory",
  "business",
  "autonomy",
  "safety",
] as const;
export type CapabilityDimension = (typeof CAPABILITY_DIMENSIONS)[number];
export type BenchmarkStatus = "passed" | "failed" | "blocked";
export interface BenchmarkCase {
  id: string;
  dimension: CapabilityDimension;
  status: BenchmarkStatus;
  evidenceRef: string;
}
export interface BenchmarkSnapshot {
  runId: string;
  recordedAt: string;
  cases: BenchmarkCase[];
}
export interface DimensionResult {
  dimension: CapabilityDimension;
  passed: number;
  failed: number;
  blocked: number;
  evaluated: number;
  passRatePercent: number | null;
}
export interface BenchmarkReport {
  runId: string;
  recordedAt: string;
  totalCases: number;
  passed: number;
  failed: number;
  blocked: number;
  evaluated: number;
  passRatePercent: number | null;
  dimensions: DimensionResult[];
  improvements: string[];
  regressions: string[];
  limitations: string[];
}
function validateSnapshot(snapshot: BenchmarkSnapshot): void {
  if (!snapshot || typeof snapshot.runId !== "string" || !snapshot.runId.trim() || snapshot.runId.length > 120) throw new Error("A bounded runId is required");
  if (typeof snapshot.recordedAt !== "string" || !Number.isFinite(Date.parse(snapshot.recordedAt))) throw new Error("recordedAt must be a valid date-time");
  if (!Array.isArray(snapshot.cases) || snapshot.cases.length < 1 || snapshot.cases.length > 500) throw new Error("A benchmark run must contain 1 to 500 cases");
  const ids = new Set<string>();
  for (const item of snapshot.cases) {
    if (!item || typeof item.id !== "string" || !/^[a-zA-Z0-9._:-]{1,120}$/.test(item.id)) throw new Error("Each case needs a stable identifier");
    if (ids.has(item.id)) throw new Error("Benchmark case identifiers must be unique within a run");
    ids.add(item.id);
    if (!CAPABILITY_DIMENSIONS.includes(item.dimension)) throw new Error("Unknown capability dimension");
    if (!["passed", "failed", "blocked"].includes(item.status)) throw new Error("Unknown benchmark status");
    if (typeof item.evidenceRef !== "string" || item.evidenceRef.length > 500) throw new Error("Evidence reference must be bounded text");
    if (item.status !== "blocked" && !item.evidenceRef.trim()) throw new Error("Passed and failed cases require an evidence reference");
  }
}
/** Summarize objective benchmark outcomes. A pass must come from an external assertion or reviewer, not an agent confidence score. */
export function buildBenchmarkReport(current: BenchmarkSnapshot, baseline?: BenchmarkSnapshot): BenchmarkReport {
  validateSnapshot(current);
  if (baseline) validateSnapshot(baseline);
  if (baseline && baseline.runId === current.runId) throw new Error("Current run and baseline must have different runIds");
  const dimensions = CAPABILITY_DIMENSIONS.map((dimension) => {
    const items = current.cases.filter((item) => item.dimension === dimension);
    const passed = items.filter((item) => item.status === "passed").length;
    const failed = items.filter((item) => item.status === "failed").length;
    const blocked = items.filter((item) => item.status === "blocked").length;
    const evaluated = passed + failed;
    return { dimension, passed, failed, blocked, evaluated, passRatePercent: evaluated ? Math.round((passed / evaluated) * 100) : null };
  });
  const passed = current.cases.filter((item) => item.status === "passed").length;
  const failed = current.cases.filter((item) => item.status === "failed").length;
  const blocked = current.cases.filter((item) => item.status === "blocked").length;
  const evaluated = passed + failed;
  const prior = new Map((baseline?.cases ?? []).map((item) => [item.id, item]));
  const improvements: string[] = [];
  const regressions: string[] = [];
  for (const item of current.cases) {
    const old = prior.get(item.id);
    if (!old || old.dimension !== item.dimension) continue;
    if (old.status === "failed" && item.status === "passed") improvements.push(item.id);
    if (old.status === "passed" && item.status === "failed") regressions.push(item.id);
  }
  return {
    runId: current.runId,
    recordedAt: current.recordedAt,
    totalCases: current.cases.length,
    passed, failed, blocked, evaluated,
    passRatePercent: evaluated ? Math.round((passed / evaluated) * 100) : null,
    dimensions, improvements, regressions,
    limitations: [
      "A pass is meaningful only when backed by a repeatable external assertion or an identified human review.",
      "Blocked cases are excluded from pass-rate denominators and must be reported separately.",
      "Only matching stable case IDs and dimensions are compared with the baseline; missing cases are not assumed to pass.",
      "A benchmark score measures this test set, not general intelligence or superiority to frontier models.",
      "Model/provider changes, prompt changes, and test-set changes should be recorded separately to make comparisons interpretable.",
    ],
  };
}
