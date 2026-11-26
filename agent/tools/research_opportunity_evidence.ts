import { defineTool } from "eve/tools";
import { z } from "zod";
import { runRevenueResearchPipeline } from "../research/revenue-research-pipeline.ts";
import type { GdeltSearchResult } from "../research/gdelt.ts";
import { fetchPublicResearchPages } from "../research/sources.ts";

export interface ResearchOpportunityEvidenceDependencies {
  search?: (query: string, options: { timespan: "1day" | "1week" | "1month"; maxRecords: number }) => Promise<GdeltSearchResult>;
  now?: () => string;
  fetch?: typeof fetch;
}

/** Injectable orchestration boundary keeps the combined discovery/retrieval path testable without live network calls. */
export async function runResearchOpportunityEvidence(
  input: {
    researchTopic: string;
    targetBuyer: string;
    problemStatement: string;
    queries: string[];
    sourceUrls: string[];
    timespan?: "1day" | "1week" | "1month";
    maxResultsPerQuery?: number;
  },
  dependencies: ResearchOpportunityEvidenceDependencies = {},
) {
  const discovery = await runRevenueResearchPipeline(input, {
    ...(dependencies.search ? { search: dependencies.search } : {}),
    ...(dependencies.now ? { now: dependencies.now } : {}),
  });
  const retrievedAt = (dependencies.now ?? (() => new Date().toISOString()))();
  const sources = await fetchPublicResearchPages(input.sourceUrls, input.researchTopic, dependencies.fetch ?? fetch);
  const evidenceCandidates = sources
    .filter(source => source.status >= 200 && source.status < 300 && source.excerpt.length > 0)
    .map((source, index) => ({
      id: "retrieved-source-" + String(index + 1).padStart(2, "0"),
      title: source.title || "Untitled source",
      finalUrl: source.url,
      accessedAt: retrievedAt,
      excerpt: source.excerpt,
      truncated: Boolean(source.truncated),
      evidenceState: "retrieved_unverified" as const,
      instruction: "Review the original page and verify the exact claim before converting this excerpt into a source observation.",
    }));
  return {
    researchTopic: input.researchTopic,
    targetBuyer: input.targetBuyer,
    problemStatement: input.problemStatement,
    discovery,
    retrieval: {
      retrievedAt,
      sources,
      evidenceCandidates,
      limitations: [
        "News results are discovery leads only; the headline and URL do not verify the article's claims.",
        "Only the five caller-supplied URLs are fetched. The reader does not crawl links or automatically follow news leads.",
        "Only exact approved HTTPS business-source hosts are fetched, including after redirects; unsupported publisher URLs are reported as blocked.",
        "Responses are limited to one megabyte and eight seconds each; only HTML, XHTML, and plain text are accepted; excerpts are capped at 8,000 characters.",
        "Retrieved excerpts are untrusted reference material, not verified facts, independent corroboration, buyer demand, willingness to pay, or revenue.",
        "No source is automatically promoted into an assessment or persistent memory.",
      ],
    },
    nextAction: "Manually inspect the original pages, record only directly supported and attributed observations, distinguish hypotheses and unknowns, then use assess_service_opportunity for a structured draft assessment.",
    permissions: {
      mayContactProspects: false,
      mayPublishOffers: false,
      mayAcceptPayments: false,
      maySpendMoney: false,
    },
  };
}

export default defineTool({
  description: "Run one bounded business-opportunity research pass: discover up to 15 headline leads with at most three keyless GDELT/Google News queries, then retrieve up to five explicitly supplied original public-source URLs from a separate exact HTTPS allowlist. Returns separate discovery leads and retrieved page excerpts with provenance and diagnostics. Retrieved excerpts are untrusted source material, not verified facts, demand, willingness to pay, or revenue. No general crawling, credentials, paid providers, memory writes, outreach, publication, spending, or purchases.",
  inputSchema: z.object({
    researchTopic: z.string().trim().min(1).max(300),
    targetBuyer: z.string().trim().min(1).max(200),
    problemStatement: z.string().trim().min(1).max(500),
    queries: z.array(z.string().trim().min(1).max(300)).min(1).max(3),
    sourceUrls: z.array(z.string().url()).min(1).max(5),
    timespan: z.enum(["1day", "1week", "1month"]).default("1week"),
    maxResultsPerQuery: z.number().int().min(1).max(5).default(5),
  }).strict(),
  async execute(input) {
    return runResearchOpportunityEvidence(input);
  },
});
