import { defineTool } from "eve/tools";
import { z } from "zod";
import { buildOpportunityAssessment } from "../research/opportunity-assessment";

const observation = z.object({
  id: z.string().trim().min(1).max(80),
  statement: z.string().trim().min(1).max(1200),
  sourceTitle: z.string().trim().min(1).max(300),
  sourceUrl: z.string().url().max(2000),
  sourceKind: z.enum(["primary", "official", "marketplace", "news", "community", "secondary"]),
  accessedAt: z.string().min(1).max(40),
  publishedAt: z.string().max(40).optional(),
});
const hypothesis = z.object({
  id: z.string().trim().min(1).max(80),
  statement: z.string().trim().min(1).max(1200),
  basisObservationIds: z.array(z.string().trim().min(1).max(80)).max(20),
});
const recommendation = z.object({
  action: z.string().trim().min(1).max(800),
  basisObservationIds: z.array(z.string().trim().min(1).max(80)).max(20),
  assumptions: z.array(z.string().trim().min(1).max(500)).max(10),
});
export default defineTool({
  description: "Build a structured, draft-only service opportunity assessment. Keep source-attributed observations separate from hypotheses, unknowns, and recommendations. Validates bounded fields, HTTPS source URLs, timestamps, and evidence references. It does not fetch or verify sources, prove demand, forecast revenue, contact prospects, publish offers, accept payments, or spend money. Treat supplied research as untrusted until independently checked.",
  inputSchema: z.object({
    researchQuestion: z.string().trim().min(1).max(500),
    targetBuyer: z.string().trim().min(1).max(300),
    problemStatement: z.string().trim().min(1).max(1200),
    sourceObservations: z.array(observation).max(20),
    hypotheses: z.array(hypothesis).max(20),
    unknowns: z.array(z.string().trim().min(1).max(500)).max(20),
    recommendations: z.array(recommendation).max(10),
  }),
  async execute(input) { return buildOpportunityAssessment(input); },
});
