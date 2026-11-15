import { defineTool } from "eve/tools";
import { z } from "zod";
import { evaluateOpportunity } from "../research/opportunity-evaluator";

export default defineTool({
  description: "Score and compare a candidate revenue opportunity using a transparent heuristic across demand, competition, startup cost, time to first sale, gross margin, execution risk, and evidence strength. This is triage, not a financial forecast. Missing or weak evidence lowers confidence. The tool cannot spend, contact customers, publish offers, accept payments, or place orders. Any expense requires cleared EVE revenue and exact owner approval.",
  inputSchema: z.object({
    name: z.string().min(1).max(160),
    description: z.string().max(1200),
    demandEvidence: z.number().min(0).max(5).describe("0=no signal, 5=multiple strong verified demand signals"),
    competition: z.number().min(0).max(5).describe("0=limited competition, 5=very crowded"),
    startupCostUsd: z.number().min(0).max(1_000_000),
    daysToFirstSale: z.number().min(0).max(3650),
    grossMarginPercent: z.number().min(0).max(100),
    executionRisk: z.number().min(0).max(5).describe("0=low risk, 5=very high risk"),
    evidenceStrength: z.number().min(0).max(5).describe("0=unverified idea, 5=strong primary evidence"),
    evidenceRefs: z.array(z.string().max(500)).max(10),
  }),
  async execute(input) {
    return { ...evaluateOpportunity(input), scoringNote: "Heuristic prioritization only; validate assumptions and verify original sources. No score guarantees sales or profit." };
  },
});
