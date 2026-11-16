const ANALYTICS_URL = "https://api.cloudflare.com/client/v4/graphql";

const QUERY = "query DailyAiNeurons($tag: string!, $day: Date!) { viewer { accounts(filter: { accountTag: $tag }) { aiInferenceAdaptiveGroups(limit: 2, filter: { date_geq: $day, date_leq: $day }) { sum { totalNeurons } dimensions { date } } } } }";

export async function fetchDailyCloudflareNeuronUsage({
  accountId,
  apiToken,
  day,
  fetchImpl = fetch,
}) {
  if (typeof accountId !== "string" || !accountId.trim()) {
    throw new TypeError("cloudflare_account_id_missing");
  }
  if (typeof apiToken !== "string" || !apiToken.trim()) {
    throw new TypeError("cloudflare_analytics_token_missing");
  }
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new TypeError("cloudflare_analytics_day_invalid");
  }

  const response = await fetchImpl(ANALYTICS_URL, {
    method: "POST",
    headers: {
      authorization: "Bearer " + apiToken,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query: QUERY,
      variables: { tag: accountId, day },
    }),
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("cloudflare_analytics_http_" + response.status);

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("cloudflare_analytics_invalid_json");
  }
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    throw new Error("cloudflare_analytics_query_or_permission_error");
  }

  const accounts = payload?.data?.viewer?.accounts;
  if (!Array.isArray(accounts) || accounts.length !== 1) {
    throw new Error("cloudflare_analytics_account_missing_or_ambiguous");
  }
  const groups = accounts[0]?.aiInferenceAdaptiveGroups;
  if (!Array.isArray(groups) || groups.length > 1) {
    throw new Error("cloudflare_analytics_aggregate_missing_or_ambiguous");
  }
  if (groups.length === 0) return 0;

  const group = groups[0];
  const usedNeurons = group?.sum?.totalNeurons;
  if (
    group?.dimensions?.date !== day ||
    typeof usedNeurons !== "number" ||
    !Number.isFinite(usedNeurons) ||
    usedNeurons < 0
  ) {
    throw new Error("cloudflare_analytics_aggregate_invalid");
  }
  return usedNeurons;
}
