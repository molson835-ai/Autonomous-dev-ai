import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return Response.json({ ok: false, error: "unauthorized" }, {
    status: 401,
    headers: { "Cache-Control": "no-store" },
  });
}

function validOperatorToken(request: Request): boolean {
  const expected = process.env.EVE_DIAGNOSTIC_TOKEN;
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!expected || expected.length < 32 || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  if (!validOperatorToken(request)) return unauthorized();

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !/^[a-f0-9]{32}$/i.test(accountId) || !apiToken) {
    return Response.json({ ok: false, error: "credential_check_unavailable" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const day = new Date().toISOString().slice(0, 10);
  const query = "query { viewer { accounts(filter: { accountTag: \"" + accountId + "\" }) { " +
    "aiInferenceAdaptiveGroups(limit: 1, filter: { date_geq: \"" + day + "\", date_leq: \"" + day + "\" }) " +
    "{ sum { totalNeurons } dimensions { date } } } } }";

  try {
    const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        authorization: "Bearer " + apiToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("analytics_request_failed");
    const payload: any = await response.json();
    if (payload?.errors?.length) throw new Error("analytics_query_failed");
    const accounts = payload?.data?.viewer?.accounts;
    if (!Array.isArray(accounts) || accounts.length !== 1) throw new Error("analytics_account_missing");
    const groups = accounts[0]?.aiInferenceAdaptiveGroups;
    if (!Array.isArray(groups) || groups.length > 1) throw new Error("analytics_result_invalid");
    if (groups.length === 1) {
      if (groups[0]?.dimensions?.date !== day ||
          typeof groups[0]?.sum?.totalNeurons !== "number" ||
          !Number.isFinite(groups[0].sum.totalNeurons) ||
          groups[0].sum.totalNeurons < 0) {
        throw new Error("analytics_result_invalid");
      }
    }
    return Response.json({
      ok: true,
      credential: "valid",
      permission: "analytics_read",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "credential_check_failed" }, {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
