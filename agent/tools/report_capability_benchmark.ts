import { defineTool } from "eve/tools";
import { z } from "zod";
import { buildBenchmarkReport } from "../evaluation/capability-benchmark";

const benchmarkCase = z.object({
  id: z.string().regex(/^[a-zA-Z0-9._:-]{1,120}$/),
  dimension: z.enum(["research", "reasoning", "coding", "memory", "business", "autonomy", "safety"]),
  status: z.enum(["passed", "failed", "blocked"]),
  evidenceRef: z.string().max(500),
});
const snapshot = z.object({
  runId: z.string().min(1).max(120),
  recordedAt: z.string().datetime(),
  cases: z.array(benchmarkCase).min(1).max(500),
});

export default defineTool({
  description: "Summarize objective EVE capability benchmark results and compare them with a prior baseline. A pass must be backed by a repeatable external test assertion or identified human review, never the agent's confidence or self-rating. Reports per-capability pass rates, blocked coverage, improvements, and regressions. This tool does not run tests or claim general intelligence or superiority to other models.",
  inputSchema: z.object({
    current: snapshot,
    baseline: snapshot.optional(),
  }),
  async execute({ current, baseline }) {
    return buildBenchmarkReport(current, baseline);
  },
});
