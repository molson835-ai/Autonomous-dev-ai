import assert from "node:assert/strict";
import test from "node:test";
import researchOpportunityEvidence, { runResearchOpportunityEvidence } from "../../agent/tools/research_opportunity_evidence.ts";

const input = {
  researchTopic: "small business inventory accuracy",
  targetBuyer: "independent retailers",
  problemStatement: "Receiving and count discrepancies can create avoidable stock errors.",
  queries: ["small retailer inventory discrepancy causes", "retail receiving errors inventory"],
  sourceUrls: ["https://www.sba.gov/business-guide/manage-your-business"],
};

const searchResult = (query) => ({
  query,
  timespan: "1week",
  articles: [{
    title: "Retail inventory accuracy guidance",
    url: "https://news.example.com/inventory-accuracy",
    domain: "news.example.com",
    seenDate: "2026-11-25T10:00:00Z",
    language: "English",
    sourceCountry: "United States",
  }],
  attribution: "test fixture",
  provider: "gdelt",
  diagnostics: { attempts: 1, fallbackUsed: false },
});

test("the discovered tool module exports an executable definition", () => {
  assert.equal(typeof researchOpportunityEvidence.execute, "function");
});

test("combined research executes bounded discovery and supplied-page retrieval with provenance", async () => {
  const calls = [];
  const output = await runResearchOpportunityEvidence(input, {
    now: () => "2026-11-25T12:00:00.000Z",
    search: async (query, options) => {
      calls.push({ kind: "search", query, options });
      return searchResult(query);
    },
    fetch: async (url, options) => {
      calls.push({ kind: "fetch", url, options });
      return new Response(
        "<!doctype html><html><head><title>Inventory controls</title></head><body><main><p>Small retailers can improve inventory accuracy by reconciling receiving records with physical counts and investigating discrepancies.</p></main></body></html>",
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    },
  });

  assert.deepEqual(calls.filter(call => call.kind === "search").map(call => call.query), input.queries);
  assert.ok(calls.every(call => call.kind === "search" || call.url === input.sourceUrls[0]));
  assert.equal(calls.filter(call => call.kind === "fetch").length, 1);
  assert.equal(output.discovery.leads.length, 1);
  assert.equal(output.discovery.evidenceState, "discovery_leads_only");
  assert.deepEqual(output.discovery.verifiedFacts, []);
  assert.deepEqual(output.discovery.sourceObservations, []);
  assert.equal(output.retrieval.sources[0].status, 200);
  assert.equal(output.retrieval.evidenceCandidates.length, 1);
  assert.equal(output.retrieval.evidenceCandidates[0].evidenceState, "retrieved_unverified");
  assert.equal(output.retrieval.evidenceCandidates[0].title, "Inventory controls");
  assert.equal(output.retrieval.evidenceCandidates[0].finalUrl, input.sourceUrls[0]);
  assert.equal(output.retrieval.evidenceCandidates[0].accessedAt, "2026-11-25T12:00:00.000Z");
  assert.equal(output.permissions.mayContactProspects, false);
  assert.equal(output.permissions.mayPublishOffers, false);
  assert.equal(output.permissions.mayAcceptPayments, false);
  assert.equal(output.permissions.maySpendMoney, false);
});

test("combined research rejects invalid public URLs without fetching them", async () => {
  let fetchCalls = 0;
  const output = await runResearchOpportunityEvidence({ ...input, sourceUrls: ["https://unapproved.example/page"] }, {
    search: async query => searchResult(query),
    fetch: async () => { fetchCalls++; throw new Error("unexpected fetch"); },
  });
  assert.equal(fetchCalls, 0);
  assert.equal(output.retrieval.sources[0].status, 0);
  assert.match(output.retrieval.sources[0].error, /allowlist/);
  assert.equal(output.retrieval.evidenceCandidates.length, 0);
});
