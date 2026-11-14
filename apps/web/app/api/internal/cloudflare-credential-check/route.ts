import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

function unauthorized() {
  return Response.json({ ok: false, error: "unauthorized" }, {
    status: 401,
    headers: noStore,
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

function classifyGraphqlErrors(errors: unknown[]): string {
  const descriptions = errors.map((item) => {
    if (!item || typeof item !== "object") return "";
    const value = item as { message?: unknown; extensions?: { code?: unknown } };
    return [value.message, value.extensions?.code]
      .filter((part): part is string => typeof part === "string")
      .join(" ")
      .toLowerCase();
  }).join(" ");

  if (/permission|forbidden|unauthorized|authentication|not authorized|access denied/.test(descriptions)) {
    return "cloudflare_permission_denied";
  }
  if (/unknown field|cannot query field|syntax error|validation error|unknown argument/.test(descriptions)) {
    return "analytics_query_rejected";
  }
  if (/account.*(not found|does not exist|invalid)|invalid account/.test(descriptions)) {
    return "cloudflare_account_not_available";
  }
  return "cloudflare_graphql_error";
}

function failure(code: string, status = 502) {
  return Response.json({ ok: false, error: code }, { status, headers: noStore });
}

export async function POST(request: Request): Promise<Response> {
  if (!validOperatorToken(request)) return unauthorized();

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !/^[a-f0-9]{32}$/i.test(accountId) || !apiToken) {
    return failure("preview_environment_incomplete", 503);
  }

  const day = new Date().toISOString().slice(0, 10);
  const query = "query { viewer { accounts(filter: { accountTag: \\"" + accountId + "\\" }) { " +
    "aiInferenceAdaptiveGroups(limit: 1, filter: { date_geq: \\"" + day + "\\", date_leq: \\"" + day + "\\" }) " +
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

    if (!response.ok) return failure("cloudflare_http_error");
    let payload: any;
    try {
      payload = await response.json();
    } catch {
      return failure("cloudflare_invalid_response");
    }

    if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
      return failure(classifyGraphqlErrors(payload.errors));
    }

    const accounts = payload?.data?.viewer?.accounts;
    if (!Array.isArray(accounts) || accounts.length !== 1) {
      return failure("cloudflare_account_not_available");
    }

    const groups = accounts[0]?.aiInferenceAdaptiveGroups;
    if (!Array.isArray(groups) || groups.length > 1) {
      return failure("analytics_result_invalid");
    }
    if (groups.length === 1 &&
        (groups[0]?.dimensions?.date !== day ||
         typeof groups[0]?.sum?.totalNeurons !== "number" ||
         !Number.isFinite(groups[0].sum.totalNeurons) ||
         groups[0].sum.totalNeurons < 0)) {
      return failure("analytics_result_invalid");
    }

    return Response.json({
      ok: true,
      credential: "valid",
      permission: "analytics_read",
    }, { headers: noStore });
  } catch (error) {
    const code = error instanceof Error && error.name === "TimeoutError"
      ? "cloudflare_request_timeout"
      : "cloudflare_network_error";
    return failure(code);
  }
}
