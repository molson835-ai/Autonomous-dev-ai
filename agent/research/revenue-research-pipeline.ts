import { searchGdeltNews, type GdeltSearchResult, type GdeltTimespan } from "./gdelt.ts";

const MAX_QUERIES = 3;
const MAX_RESULTS_PER_QUERY = 5;
const MAX_TOTAL_LEADS = MAX_QUERIES * MAX_RESULTS_PER_QUERY;

export interface RevenueResearchInput {
  researchTopic: string;
  targetBuyer: string;
  problemStatement: string;
  queries: string[];
  timespan?: GdeltTimespan;
  maxResultsPerQuery?: number;
}
type SearchFunction = (query: string, options: { timespan: GdeltTimespan; maxRecords: number }) => Promise<GdeltSearchResult>;
interface Lead {
  id: string;
  title: string;
  url: string;
  domain: string;
  seenDate: string;
  language: string;
  sourceCountry: string;
  provider: "gdelt" | "google-news-rss";
  matchedQueries: string[];
}
export interface RevenueResearchResult {
  researchTopic: string;
  targetBuyer: string;
  problemStatement: string;
  searchedAt: string;
  timespan: GdeltTimespan;
  queryRuns: Array<{
    query: string;
    status: "ok" | "unavailable";
    provider?: "gdelt" | "google-news-rss";
    attempts?: number;
    fallbackUsed?: boolean;
    unavailableReason?: "timeout" | "provider-error";
    returnedLeadCount: number;
    error?: string;
  }>;
  leads: Lead[];
  evidenceState: "discovery_leads_only" | "no_leads_found";
  verifiedFacts: [];
  sourceObservations: [];
  nextSteps: string[];
  limitations: string[];
}

/**
 * Runs a small, keyless news-discovery batch. Headlines/URLs remain leads only:
 * this function never fetches publisher pages or converts a headline into a fact.
 */
export async function runRevenueResearchPipeline(
  input: RevenueResearchInput,
  dependencies: { search?: SearchFunction; now?: () => string } = {},
): Promise<RevenueResearchResult> {
  const text = (value: unknown, field: string, max: number) => {
    if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
      throw new Error(field + " must contain 1 to " + max + " characters");
    }
    return value.trim();
  };
  if (!input || typeof input !== "object") throw new Error("Research input is required");
  const researchTopic = text(input.researchTopic, "researchTopic", 300);
  const targetBuyer = text(input.targetBuyer, "targetBuyer", 200);
  const problemStatement = text(input.problemStatement, "problemStatement", 500);
  if (!Array.isArray(input.queries) || input.queries.length < 1 || input.queries.length > MAX_QUERIES) {
    throw new Error("queries must contain 1 to " + MAX_QUERIES + " focused search queries");
  }
  const queries = input.queries.map((query) => text(query, "query", 300));
  if (new Set(queries.map((query) => query.toLowerCase())).size !== queries.length) {
    throw new Error("Search queries must be distinct");
  }
  const timespan = input.timespan ?? "1week";
  if (!["1day", "1week", "1month"].includes(timespan)) throw new Error("Unsupported research timespan");
  const maxResultsPerQuery = input.maxResultsPerQuery ?? MAX_RESULTS_PER_QUERY;
  if (!Number.isInteger(maxResultsPerQuery) || maxResultsPerQuery < 1 || maxResultsPerQuery > MAX_RESULTS_PER_QUERY) {
    throw new Error("maxResultsPerQuery must be an integer from 1 to " + MAX_RESULTS_PER_QUERY);
  }

  const search = dependencies.search ?? searchGdeltNews;
  const now = dependencies.now ?? (() => new Date().toISOString());
  const searchedAt = now();
  const queryRuns: RevenueResearchResult["queryRuns"] = [];
  const leads: Lead[] = [];
  const byUrl = new Map<string, Lead>();

  // Sequential requests keep provider load predictable and make the call budget explicit.
  for (const query of queries) {
    try {
      const result = await search(query, { timespan, maxRecords: maxResultsPerQuery });
      let returnedLeadCount = 0;
      for (const article of result.articles.slice(0, maxResultsPerQuery)) {
        let parsed: URL;
        try { parsed = new URL(article.url); } catch { continue; }
        if (parsed.protocol !== "https:" || parsed.username || parsed.password) continue;
        parsed.hash = "";
        const canonicalUrl = parsed.toString();
        const existing = byUrl.get(canonicalUrl);
        if (existing) {
          if (!existing.matchedQueries.includes(query)) existing.matchedQueries.push(query);
          returnedLeadCount++;
          continue;
        }
        if (leads.length >= MAX_TOTAL_LEADS) break;
        const lead: Lead = {
          id: "lead-" + String(leads.length + 1).padStart(2, "0"),
          title: article.title.slice(0, 500),
          url: canonicalUrl,
          domain: article.domain.slice(0, 255),
          seenDate: article.seenDate.slice(0, 80),
          language: article.language.slice(0, 40),
          sourceCountry: article.sourceCountry.slice(0, 80),
          provider: result.provider,
          matchedQueries: [query],
        };
        leads.push(lead);
        byUrl.set(canonicalUrl, lead);
        returnedLeadCount++;
      }
      queryRuns.push({
        query, status: "ok", provider: result.provider,
        attempts: result.diagnostics.attempts,
        fallbackUsed: result.diagnostics.fallbackUsed,
        ...(result.diagnostics.unavailableReason ? { unavailableReason: result.diagnostics.unavailableReason } : {}),
        returnedLeadCount,
      });
    } catch (error) {
      queryRuns.push({
        query, status: "unavailable", returnedLeadCount: 0,
        error: error instanceof Error ? error.message.slice(0, 180) : "search_unavailable",
      });
    }
  }

  return {
    researchTopic, targetBuyer, problemStatement, searchedAt, timespan, queryRuns, leads,
    evidenceState: leads.length ? "discovery_leads_only" : "no_leads_found",
    verifiedFacts: [],
    sourceObservations: [],
    nextSteps: [
      "Open each promising publisher URL and inspect the original page; search headlines are not evidence of the underlying claim.",
      "Record only directly supported, attributed observations with source title, exact URL, access time, and publication time when available.",
      "Separate observations from hypotheses and unknowns; seek primary, marketplace, and customer-problem sources rather than counting repeated syndication as independent evidence.",
      "Use the existing draft assessment and opportunity evaluator only after collecting source material; keep demand, costs, margins, and time-to-sale unknown until supported.",
      "Do not contact prospects, publish offers, accept payments, spend money, or create external commitments without separate exact owner approval.",
    ],
    limitations: [
      "This is bounded keyless news discovery through GDELT with the existing Google News RSS fallback, not comprehensive web or marketplace search.",
      "Headlines, snippets, domains, dates, and URLs are unverified discovery metadata; no publisher page is fetched and no market fact is asserted.",
      "A result count or multiple hostnames does not establish source independence, buyer demand, willingness to pay, sales, or profit.",
      "No Tavily request, paid provider, account credential, persistent-memory write, task creation, external communication, or purchase is used.",
      "No leads found means only that these queries returned no usable leads in this search window; it does not prove that demand is absent.",
    ],
  };
}
