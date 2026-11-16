import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const cloudflareBase = "https://api.cloudflare.com/client/v4";

function unauthorized() {
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
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

function failure(code: string, status = 502, details: Record<string, unknown> = {}) {
  return Response.json({ ok: false, error: code, ...details }, { status, headers: noStore });
}

function safeCloudflareErrors(errors: unknown[], accountId: string) {
  return errors.slice(0, 4).map((item) => {
    if (!item || typeof item !== "object") return { message: "Unrecognized Cloudflare error." };
    const value = item as { code?: unknown; message?: unknown; extensions?: { code?: unknown } };
    const rawMessage = typeof value.message === "string" ? value.message : "Cloudflare returned an unspecified error.";
    const message = rawMessage
      .replaceAll(accountId, "[account]")
      .replace(/cf(?:at|ut)_[A-Za-z0-9_-]+/gi, "[redacted-token]")
      .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
      .slice(0, 220);
    return {
      ...(typeof value.code === "number" ? { code: value.code } : {}),
      ...(typeof value.extensions?.code === "string" || typeof value.extensions?.code === "number"
        ? { extensionCode: value.extensions.code } : {}),
      message,
    };
  });
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

async function readJson(response: Response): Promise<any | null> {
  try { return await response.json(); } catch { return null; }
}

export async function POST(request: Request): Promise<Response> {
  if (!validOperatorToken(request)) return unauthorized();

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !/^[a-f0-9]{32}$/i.test(accountId) || !apiToken) {
    return failure("production_environment_incomplete", 503);
  }

  const headers = {
    authorization: "Bearer " + apiToken,
    "content-type": "application/json",
  };

  // Stage 1: ask Cloudflare to verify this account-owned token against the
  // exact account configured for EVE. This returns status/ID, never the secret.
  try {
    const verifyResponse = await fetch(
      `${cloudflareBase}/accounts/${accountId}/tokens/verify`,
      { method: "GET", headers: { authorization: headers.authorization }, signal: AbortSignal.timeout(8000), cache: "no-store" },
    );
    const verifyPayload = await readJson(verifyResponse);
    if (!verifyResponse.ok || verifyPayload?.success !== true || !verifyPayload?.result) {
      const errors = Array.isArray(verifyPayload?.errors) ? verifyPayload.errors : [];
      return failure("cloudflare_token_verification_failed", 502, {
        verificationHttpStatus: verifyResponse.status,
        cloudflareErrors: safeCloudflareErrors(errors, accountId),
      });
    }
    const tokenStatus = verifyPayload.result.status;
    if (tokenStatus !== "active") {
      return failure("cloudflare_token_inactive", 502, { tokenStatus });
    }

    // Stage 2: independently test the GraphQL dataset used by the quota guard.
    const day = new Date().toISOString().slice(0, 10);
    const query = `query {
      viewer {
        accounts(filter: { accountTag: ${JSON.stringify(accountId)} }) {
          aiInferenceAdaptiveGroups(
            limit: 1
            filter: { date_geq: ${JSON.stringify(day)}, date_leq: ${JSON.stringify(day)} }
          ) {
            sum { totalNeurons }
            dimensions { date }
          }
        }
      }
    }`;

    const response = await fetch(`${cloudflareBase}/graphql`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) return failure("cloudflare_graphql_http_error", 502, { graphqlHttpStatus: response.status });

    const payload = await readJson(response);
    if (!payload) return failure("cloudflare_invalid_response");
    if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
      const errors = safeCloudflareErrors(payload.errors, accountId);
      return failure(classifyGraphqlErrors(payload.errors), 502, {
        tokenStatus: "active",
        cloudflareErrors: errors,
      });
    }

    const accounts = payload?.data?.viewer?.accounts;
    if (!Array.isArray(accounts) || accounts.length !== 1) {
      return failure("cloudflare_account_not_available", 502, { tokenStatus: "active" });
    }

    const groups = accounts[0]?.aiInferenceAdaptiveGroups;
    if (!Array.isArray(groups) || groups.length > 1) {
      return failure("analytics_result_invalid", 502, { tokenStatus: "active" });
    }
    if (groups.length === 1 &&
        (groups[0]?.dimensions?.date !== day ||
         typeof groups[0]?.sum?.totalNeurons !== "number" ||
         !Number.isFinite(groups[0].sum.totalNeurons) ||
         groups[0].sum.totalNeurons < 0)) {
      return failure("analytics_result_invalid", 502, { tokenStatus: "active" });
    }

    return Response.json({
      ok: true,
      credential: "valid",
      tokenStatus: "active",
      permission: "analytics_read",
    }, { headers: noStore });
  } catch (error) {
    const code = error instanceof Error && error.name === "TimeoutError"
      ? "cloudflare_request_timeout"
      : "cloudflare_network_error";
    return failure(code);
  }
}
