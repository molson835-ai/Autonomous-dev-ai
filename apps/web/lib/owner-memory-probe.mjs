const EXPECTED_WORKER_HOST = "autonomous-dev-memory.molson835.workers.dev";
const REQUEST_TIMEOUT_MS = 8000;
function emptyCheck(name, errorCode) { return { name, status: null, elapsed_ms: 0, cf_ray: null, error_code: errorCode }; }
function safeCfRay(value) { return typeof value === "string" && /^[a-z0-9-]{1,128}$/i.test(value) ? value : null; }
async function probe(name, endpoint, token, fetchImpl) {
  const started = Date.now();
  try {
    const response = await fetchImpl(endpoint, { method: "GET", headers: { authorization: "Bearer " + token, accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    return { name, status: response.status, elapsed_ms: Math.max(0, Date.now() - started), cf_ray: safeCfRay(response.headers.get("cf-ray")), error_code: response.ok ? null : "upstream_http_error" };
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return { name, status: null, elapsed_ms: Math.max(0, Date.now() - started), cf_ray: null, error_code: timedOut ? "upstream_timeout" : "upstream_network_error" };
  }
}
export async function runOwnerMemoryProbe({ baseUrl, token, fetchImpl = fetch }) {
  let parsedBase;
  try {
    if (typeof baseUrl !== "string" || !baseUrl) throw new Error("missing_url");
    parsedBase = new URL(baseUrl);
  } catch {
    const code = typeof baseUrl === "string" && baseUrl ? "configuration_invalid" : "configuration_missing";
    return { host_matches_expected: false, checks: [emptyCheck("memory_recall", code), emptyCheck("memory_experiences", code)] };
  }
  const hostMatches = parsedBase.protocol === "https:" && !parsedBase.username && !parsedBase.password && !parsedBase.search && !parsedBase.hash && (!parsedBase.port || parsedBase.port === "443") && parsedBase.hostname.toLowerCase() === EXPECTED_WORKER_HOST;
  if (!hostMatches) return { host_matches_expected: false, checks: [emptyCheck("memory_recall", "worker_host_mismatch"), emptyCheck("memory_experiences", "worker_host_mismatch")] };
  if (typeof token !== "string" || !token) return { host_matches_expected: true, checks: [emptyCheck("memory_recall", "configuration_missing"), emptyCheck("memory_experiences", "configuration_missing")] };
  const checks = await Promise.all([
    probe("memory_recall", new URL("/v1/recall?limit=1", parsedBase), token, fetchImpl),
    probe("memory_experiences", new URL("/v1/experiences?external_id=test", parsedBase), token, fetchImpl),
  ]);
  return { host_matches_expected: true, checks };
}
