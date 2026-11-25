import assert from "node:assert/strict";
import test from "node:test";
import { runRevenueResearchPipeline } from "../../agent/research/revenue-research-pipeline.ts";

const base = {
  researchTopic: "Low-cost workflow software for independent service businesses",
  targetBuyer: "Independent service-business owners",
  problemStatement: "Owners may spend time repeating routine admin tasks.",
  queries: ["small business admin workflow pain points", "independent service business software demand"],
};
const article = (url, title = "Publisher story") => ({
  title, url, domain: new URL(url).hostname, seenDate: "2026-11-25T10:00:00Z",
  language: "English", sourceCountry: "United States",
});
const result = (articles, provider = "gdelt") => ({
  articles, provider, diagnostics: { attempts: 1, fallbackUsed: provider !== "gdelt" },
});

test("runs distinct queries sequentially and returns reusable deduplicated leads", async () => {
  const calls = [];
  const output = await runRevenueResearchPipeline(base, {
    now: () => "2026-11-25T12:00:00Z",
    search: async (query, options) => {
      calls.push({ query, options, completed: calls.length });
      return result(query === base.queries[0]
        ? [article("https://publisher.example/story#top"), article("https://other.example/item")]
        : [article("https://publisher.example/story#comments", "Duplicate syndication")]);
    },
  });
  assert.deepEqual(calls.map(call => call.query), base.queries);
  assert.deepEqual(calls.map(call => call.options.maxRecords), [5, 5]);
  assert.equal(output.searchedAt, "2026-11-25T12:00:00Z");
  assert.equal(output.leads.length, 2);
  assert.deepEqual(output.leads[0].matchedQueries, base.queries);
  assert.equal(output.leads[0].url, "https://publisher.example/story");
  assert.equal(output.evidenceState, "discovery_leads_only");
  assert.deepEqual(output.verifiedFacts, []);
  assert.deepEqual(output.sourceObservations, []);
});

test("keeps provider and fallback diagnostics for each query", async () => {
  const output = await runRevenueResearchPipeline({ ...base, queries: [base.queries[0]] }, {
    search: async () => result([article("https://publisher.example/a")], "google-news-rss"),
  });
  assert.equal(output.queryRuns[0].provider, "google-news-rss");
  assert.equal(output.queryRuns[0].fallbackUsed, true);
});

test("isolates one query failure without discarding other query results", async () => {
  let calls = 0;
  const output = await runRevenueResearchPipeline(base, {
    search: async () => {
      calls++;
      if (calls === 1) throw new Error("temporary provider issue");
      return result([article("https://publisher.example/a")]);
    },
  });
  assert.equal(output.queryRuns[0].status, "unavailable");
  assert.match(output.queryRuns[0].error, /temporary provider issue/);
  assert.equal(output.queryRuns[1].status, "ok");
  assert.equal(output.leads.length, 1);
});

test("does not treat an empty search as evidence of no demand", async () => {
  const output = await runRevenueResearchPipeline({ ...base, queries: [base.queries[0]] }, {
    search: async () => result([]),
  });
  assert.equal(output.evidenceState, "no_leads_found");
  assert.match(output.limitations.join(" "), /does not prove that demand is absent/);
});

test("rejects duplicate queries and unbounded query counts before searching", async () => {
  let calls = 0;
  const search = async () => { calls++; return result([]); };
  await assert.rejects(runRevenueResearchPipeline({ ...base, queries: [base.queries[0], base.queries[0]] }, { search }), /distinct/);
  await assert.rejects(runRevenueResearchPipeline({ ...base, queries: ["a", "b", "c", "d"] }, { search }), /1 to 3/);
  assert.equal(calls, 0);
});

test("rejects unsafe article URLs", async () => {
  const output = await runRevenueResearchPipeline({ ...base, queries: [base.queries[0]], maxResultsPerQuery: 5 }, {
    search: async () => result([
      article("http://insecure.example/a"),
      { ...article("https://safe.example/a"), url: "https://user:pass@safe.example/a" },
      article("https://valid.example/a"),
    ]),
  });
  assert.equal(output.leads.length, 1);
  assert.equal(output.leads[0].url, "https://valid.example/a");
});

test("enforces the per-query result cap even if a provider adapter over-returns", async () => {
  const output = await runRevenueResearchPipeline({ ...base, queries: [base.queries[0]], maxResultsPerQuery: 2 }, {
    search: async () => result([
      article("https://valid.example/a"),
      article("https://valid.example/b"),
      article("https://valid.example/c"),
    ]),
  });
  assert.equal(output.leads.length, 2);
});

test("validates research context and per-query result bounds", async () => {
  await assert.rejects(runRevenueResearchPipeline({ ...base, targetBuyer: " " }), /targetBuyer/);
  await assert.rejects(runRevenueResearchPipeline({ ...base, maxResultsPerQuery: 6 }), /1 to 5/);
});
