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
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}
function safeErrors(errors: unknown[], accountId: string) {
  return errors.slice(0, 4).map((item) => {
    const value = item && typeof item === "object" ? item as { code?: unknown; message?: unknown; extensions?: { code?: unknown } } : {};
    const raw = typeof value.message === "string" ? value.message : "Unrecognized Cloudflare error.";
    return {
      ...(typeof value.code === "number" ? { code: value.code } : {}),
      ...(typeof value.extensions?.code === "string" || typeof value.extensions?.code === "number" ? { extensionCode: value.extensions.code } : {}),
      message: raw.replaceAll(accountId, "[account]").replace(/cf(?:at|ut)_[A-Za-z0-9_-]+/gi, "[redacted-token]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 240),
    };
  });
}
function classify(errors: unknown[]): string {
  const s = errors.map((e) => e && typeof e === "object"
    ? String((e as any).message ?? "") + " " + String((e as any).code ?? "") + " " + String((e as any).extensionCode ?? (e as any).extensions?.code ?? "")
    : "").join(" ").toLowerCase();
  if (/permission|forbidden|unauthorized|authentication|not authorized|access denied/.test(s)) return "permission_denied";
  if (/unknown field|cannot query field|syntax error|validation error|unknown argument/.test(s)) return "schema_or_query_rejected";
  if (/account.*(not found|does not exist|invalid)|invalid account/.test(s)) return "account_not_available";
  return "graphql_error";
}
async function json(response: Response): Promise<any | null> {
  try { return await response.json(); } catch { return null; }
}
type Stage = { name: string; status: "pass" | "fail"; httpStatus?: number; code?: string; details?: Record<string, unknown>; errors?: unknown[] };
async function graphql(token: string, query: string, accountId: string): Promise<{ httpStatus: number; payload: any | null; errors: unknown[] }> {
  const response = await fetch(`${cloudflareBase}/graphql`, {
    method: "POST",
    headers: { authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  const payload = await json(response);
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  return { httpStatus: response.status, payload, errors: safeErrors(errors, accountId) };
}
function stageFailure(name: string, result: { httpStatus: number; payload: any | null; errors: unknown[] }, code?: string): Stage {
  return { name, status: "fail", httpStatus: result.httpStatus, code: code ?? (result.errors.length ? classify(result.errors) : "http_or_invalid_response"), errors: result.errors };
}

export async function POST(request: Request): Promise<Response> {
  if (!validOperatorToken(request)) return unauthorized();
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !/^[a-f0-9]{32}$/i.test(accountId) || !apiToken) {
    return Response.json({ ok: false, error: "production_environment_incomplete" }, { status: 503, headers: noStore });
  }

  try {
    const verify = await fetch(`${cloudflareBase}/accounts/${accountId}/tokens/verify`, {
      method: "GET", headers: { authorization: "Bearer " + apiToken },
      signal: AbortSignal.timeout(8000), cache: "no-store",
    });
    const verifyPayload = await json(verify);
    if (!verify.ok || verifyPayload?.success !== true || verifyPayload?.result?.status !== "active") {
      return Response.json({
        ok: false, error: "token_verification_failed", verificationHttpStatus: verify.status,
        tokenStatus: verifyPayload?.result?.status ?? "unknown",
        cloudflareErrors: safeErrors(Array.isArray(verifyPayload?.errors) ? verifyPayload.errors : [], accountId),
      }, { status: 502, headers: noStore });
    }

    const day = new Date().toISOString().slice(0, 10);
    const stages: Stage[] = [];

    // Test 1: GraphQL can resolve the account without touching a product dataset.
    const accountQuery = `query { viewer { accounts(filter: { accountTag: ${JSON.stringify(accountId)} }) { accountTag } } }`;
    const accountResult = await graphql(apiToken, accountQuery, accountId);
    const accountRows = accountResult.payload?.data?.viewer?.accounts;
    if (accountResult.httpStatus >= 200 && accountResult.httpStatus < 300 && !accountResult.errors.length && Array.isArray(accountRows) && accountRows.some((a: any) => a?.accountTag === accountId)) {
      stages.push({ name: "account_lookup", status: "pass", httpStatus: accountResult.httpStatus, details: { accountReturned: true } });
    } else stages.push(stageFailure("account_lookup", accountResult));

    // Test 2: schema introspection shows whether the account type exposes this dataset.
    const schemaQuery = `query { __type(name: "account") { fields(includeDeprecated: true) { name type { kind name ofType { kind name } } } } }`;
    const schemaResult = await graphql(apiToken, schemaQuery, accountId);
    const fields = schemaResult.payload?.data?.__type?.fields;
    const datasetField = Array.isArray(fields) ? fields.find((f: any) => f?.name === "aiInferenceAdaptiveGroups") : null;
    if (schemaResult.httpStatus >= 200 && schemaResult.httpStatus < 300 && !schemaResult.errors.length && datasetField) {
      stages.push({ name: "schema_introspection", status: "pass", httpStatus: schemaResult.httpStatus, details: { datasetFieldExposed: true, returnType: datasetField.type?.name ?? datasetField.type?.ofType?.name ?? "available" } });
    } else if (schemaResult.httpStatus >= 200 && schemaResult.httpStatus < 300 && !schemaResult.errors.length) {
      stages.push({ name: "schema_introspection", status: "fail", httpStatus: schemaResult.httpStatus, code: fields ? "dataset_field_not_in_account_schema" : "account_type_not_visible" });
    } else stages.push(stageFailure("schema_introspection", schemaResult));

    // Test 3a: Cloudflare's settings node reports per-token dataset availability/fields.
    const settingsQuery = `query { viewer { accounts(filter: { accountTag: ${JSON.stringify(accountId)} }) { settings { aiInferenceAdaptiveGroups { enabled availableFields } } } } }`;
    const settingsResult = await graphql(apiToken, settingsQuery, accountId);
    const settings = settingsResult.payload?.data?.viewer?.accounts?.[0]?.settings?.aiInferenceAdaptiveGroups;
    if (settingsResult.httpStatus >= 200 && settingsResult.httpStatus < 300 && !settingsResult.errors.length && settings && typeof settings.enabled === "boolean") {
      stages.push({ name: "dataset_settings", status: settings.enabled ? "pass" : "fail", httpStatus: settingsResult.httpStatus, code: settings.enabled ? undefined : "dataset_disabled_for_requester", details: { enabled: settings.enabled, availableFields: Array.isArray(settings.availableFields) ? settings.availableFields.slice(0, 40) : [] } });
    } else stages.push(stageFailure("dataset_settings", settingsResult));

    // Test 3b: execute the exact daily dataset/metric used by EVE's quota guard.
    const usageQuery = `query { viewer { accounts(filter: { accountTag: ${JSON.stringify(accountId)} }) { aiInferenceAdaptiveGroups(limit: 2, filter: { date_geq: ${JSON.stringify(day)}, date_leq: ${JSON.stringify(day)} }) { sum { totalNeurons } dimensions { date } } } } }`;
    const usageResult = await graphql(apiToken, usageQuery, accountId);
    const groups = usageResult.payload?.data?.viewer?.accounts?.[0]?.aiInferenceAdaptiveGroups;
    const validGroups = Array.isArray(groups) && groups.length <= 1 && (groups.length === 0 || (groups[0]?.dimensions?.date === day && typeof groups[0]?.sum?.totalNeurons === "number" && Number.isFinite(groups[0].sum.totalNeurons) && groups[0].sum.totalNeurons >= 0));
    if (usageResult.httpStatus < 200 || usageResult.httpStatus >= 300 || usageResult.errors.length > 0) {
      // Preserve Cloudflare's classified error instead of masking it as a bad result shape.
      stages.push(stageFailure("quota_guard_query", usageResult));
    } else if (validGroups) {
      stages.push({ name: "quota_guard_query", status: "pass", httpStatus: usageResult.httpStatus, details: { utcDate: day, rowReturned: groups.length === 1, neuronTotalReturned: groups.length === 1 } });
    } else {
      stages.push(stageFailure("quota_guard_query", usageResult, "analytics_result_invalid"));
    }

    return Response.json({
      ok: stages.every((s) => s.status === "pass"),
      tokenStatus: "active",
      tests: stages,
      note: "Read-only GraphQL diagnostics. No inference or quota reservation was performed.",
    }, { headers: noStore });
  } catch (error) {
    const code = error instanceof Error && error.name === "TimeoutError" ? "cloudflare_request_timeout" : "cloudflare_network_error";
    return Response.json({ ok: false, error: code, note: "Diagnostic stopped on a network/timeout error. No inference was performed." }, { status: 502, headers: noStore });
  }
}
