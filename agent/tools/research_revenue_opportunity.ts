import { defineTool } from "eve/tools";
import { z } from "zod";
import { runRevenueResearchPipeline } from "../research/revenue-research-pipeline";

export default defineTool({
  description: "Run a small, keyless revenue-opportunity news-discovery batch using up to three distinct focused queries. Returns deduplicated publisher leads and a reusable verification checklist. Headlines are not verified facts; this tool does not fetch publisher pages, establish demand, forecast revenue, contact anyone, publish, spend, or write memory. Tavily and paid providers are not used.",
  inputSchema: z.object({
    researchTopic: z.string().trim().min(1).max(300),
    targetBuyer: z.string().trim().min(1).max(200),
    problemStatement: z.string().trim().min(1).max(500),
    queries: z.array(z.string().trim().min(1).max(300)).min(1).max(3),
    timespan: z.enum(["1day", "1week", "1month"]).default("1week"),
    maxResultsPerQuery: z.number().int().min(1).max(5).default(5),
  }),
  async execute(input) {
    return runRevenueResearchPipeline(input);
  },
});
