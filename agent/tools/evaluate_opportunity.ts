import { defineTool } from "eve/tools";
import { z } from "zod";
import { evaluateOpportunity } from "../research/opportunity-evaluator";

export default defineTool({
  description: "Score and compare a candidate revenue opportunity using a transparent heuristic. All numeric signals and evidence references are supplied by the caller and are not independently verified, so confidence always remains low and the tool can only recommend further investigation or deprioritization. It cannot recommend a market test, forecast revenue, spend, contact customers, publish offers, accept payments, or place orders. Any expense requires cleared EVE revenue and exact owner approval.",
  inputSchema: z.object({
    name: z.string().min(1).max(160),
    description: z.string().max(1200),
    demandEvidence: z.number().min(0).max(5).describe("Caller-supplied demand signal; not verified by this tool"),
    competition: z.number().min(0).max(5).describe("Caller-supplied competition signal; not verified by this tool"),
    startupCostUsd: z.number().min(0).max(1_000_000),
    daysToFirstSale: z.number().min(0).max(3650),
    grossMarginPercent: z.number().min(0).max(100),
    executionRisk: z.number().min(0).max(5).describe("Caller-supplied execution risk; not verified by this tool"),
    evidenceStrength: z.number().min(0).max(5).describe("Caller-supplied evidence signal; not verified by this tool"),
    evidenceRefs: z.array(z.string().max(500)).max(10),
  }),
  async execute(input) {
    return { ...evaluateOpportunity(input), scoringNote: "Heuristic prioritization only. All inputs are caller-supplied; confidence remains low until original sources and claims are independently verified. No score guarantees sales or profit." };
  },
});
