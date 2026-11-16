import test from "node:test";
import assert from "node:assert/strict";
import { fetchDailyCloudflareNeuronUsage } from "../agent/lib/cloudflare-analytics.mjs";

const day = "2026-11-15";

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("queries the exact account and UTC day using GraphQL variables", async () => {
  let request;
  const used = await fetchDailyCloudflareNeuronUsage({
    accountId: "test-account",
    apiToken: "test-read-only-token",
    day,
    fetchImpl: async (url, init) => {
      request = { url, init, body: JSON.parse(init.body) };
      return response({
        data: { viewer: { accounts: [{
          aiInferenceAdaptiveGroups: [{
            sum: { totalNeurons: 1234 },
            dimensions: { date: day },
          }],
        }] } },
      });
    },
  });
  assert.equal(used, 1234);
  assert.equal(request.url, "https://api.cloudflare.com/client/v4/graphql");
  assert.equal(request.body.variables.tag, "test-account");
  assert.equal(request.body.variables.day, day);
  assert.match(request.body.query, /\$tag: string!/);
  assert.match(request.body.query, /\$day: Date!/);
  assert.doesNotMatch(request.body.query, /test-account|2026-11-15/);
  assert.equal(request.init.headers.authorization, "Bearer test-read-only-token");
});

test("treats a valid empty daily aggregate as zero", async () => {
  const used = await fetchDailyCloudflareNeuronUsage({
    accountId: "test-account",
    apiToken: "test-read-only-token",
    day,
    fetchImpl: async () => response({
      data: { viewer: { accounts: [{ aiInferenceAdaptiveGroups: [] }] } },
    }),
  });
  assert.equal(used, 0);
});

test("fails closed on HTTP, GraphQL, missing account, ambiguous rows, and bad dates", async () => {
  const args = { accountId: "test-account", apiToken: "test-read-only-token", day };
  await assert.rejects(fetchDailyCloudflareNeuronUsage({ ...args, fetchImpl: async () => response({}, 403) }), /http_403/);
  await assert.rejects(fetchDailyCloudflareNeuronUsage({ ...args, fetchImpl: async () => response({ errors: [{ message: "denied" }] }) }), /permission_error/);
  await assert.rejects(fetchDailyCloudflareNeuronUsage({ ...args, fetchImpl: async () => response({ data: { viewer: { accounts: [] } } }) }), /account_missing/);
  await assert.rejects(fetchDailyCloudflareNeuronUsage({ ...args, fetchImpl: async () => response({ data: { viewer: { accounts: [{ aiInferenceAdaptiveGroups: [{}, {}] }] } } }) }), /aggregate_missing/);
  await assert.rejects(fetchDailyCloudflareNeuronUsage({ ...args, fetchImpl: async () => response({ data: { viewer: { accounts: [{ aiInferenceAdaptiveGroups: [{ sum: { totalNeurons: 1 }, dimensions: { date: "2026-11-14" } }] }] } } }) }), /aggregate_invalid/);
});
