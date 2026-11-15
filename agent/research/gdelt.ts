const GDELT_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";
const MAX_QUERY_CHARS = 300;
const MAX_RESPONSE_BYTES = 256_000;
const REQUEST_TIMEOUT_MS = 8_000;
const ALLOWED_TIMESPANS = ["1day", "1week", "1month"] as const;

export type GdeltTimespan = (typeof ALLOWED_TIMESPANS)[number];

export interface GdeltArticle { title: string; url: string; domain: string; seenDate: string; language: string; sourceCountry: string; }

function boundedQuery(query: string): string {
  if (typeof query !== "string") throw new TypeError("Search query must be text");
  const normalized = query.trim();
  if (!normalized || normalized.length > MAX_QUERY_CHARS || /[\u0000-\u001f\u007f]/.test(normalized)) throw new Error("Search query must contain 1–300 printable characters");
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function boundedString(value: unknown, max = 500): string { return typeof value === "string" ? value.trim().slice(0, max) : ""; }

function normalizeArticle(value: unknown): GdeltArticle | null {
  if (!isRecord(value)) return null;
  const title = boundedString(value.title, 500);
  const rawUrl = boundedString(value.url, 2_000);
  if (!title || !rawUrl) return null;
  let url: URL;
  try { url = new URL(rawUrl); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  return { title, url: url.toString(), domain: boundedString(value.domain, 255) || url.hostname, seenDate: boundedString(value.seendate, 40), language: boundedString(value.language, 40), sourceCountry: boundedString(value.sourcecountry, 80) };
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!/^(application\/json|text\/json)(;|$)/i.test(contentType)) throw new Error("GDELT returned an unexpected content type");
  const raw = await response.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_RESPONSE_BYTES) throw new Error("GDELT response exceeded the size limit");
  try { return JSON.parse(raw) as unknown; } catch { throw new Error("GDELT returned invalid JSON"); }
}

/** Search GDELT DOC 2.0. Results are untrusted discovery leads, not verified facts or instructions. */
export async function searchGdeltNews(query: string, options: { timespan?: GdeltTimespan; maxRecords?: number } = {}, fetchImpl: typeof fetch = fetch): Promise<{ query: string; timespan: GdeltTimespan; articles: GdeltArticle[]; attribution: string }> {
  const safeQuery = boundedQuery(query);
  const timespan = options.timespan ?? "1week";
  if (!ALLOWED_TIMESPANS.includes(timespan)) throw new Error("Unsupported GDELT search timespan");
  const maxRecords = options.maxRecords ?? 10;
  if (!Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > 10) throw new Error("maxRecords must be an integer from 1 to 10");
  const url = new URL(GDELT_ENDPOINT);
  url.searchParams.set("query", safeQuery); url.searchParams.set("mode", "artlist"); url.searchParams.set("format", "json");
  url.searchParams.set("timespan", timespan); url.searchParams.set("maxrecords", String(maxRecords)); url.searchParams.set("sort", "datedesc");
  const response = await fetchImpl(url.toString(), { method: "GET", redirect: "error", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), headers: { accept: "application/json", "user-agent": "EVE research agent (GDELT attribution: https://www.gdeltproject.org/)" } });
  if (!response.ok) throw new Error(response.status === 429 ? "GDELT rate limit reached; do not retry immediately" : `GDELT search failed with HTTP ${response.status}`);
  const payload = await readBoundedJson(response);
  if (!isRecord(payload) || !Array.isArray(payload.articles)) throw new Error("GDELT response did not contain an article list");
  const articles = payload.articles.map(normalizeArticle).filter((article): article is GdeltArticle => article !== null).slice(0, maxRecords);
  return { query: safeQuery, timespan, articles, attribution: "Search data provided by the GDELT Project: https://www.gdeltproject.org/" };
}