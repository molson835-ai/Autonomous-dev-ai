export const APPROVED_RESEARCH_HOSTS = [
  "developer.mozilla.org",
  "tc39.es",
  "owasp.org",
  "developers.cloudflare.com",
  "vercel.com",
] as const;

export const MAX_SOURCE_BYTES = 120_000;
export const MAX_EXCERPT_CHARS = 6_000;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 8_000;

export function validateResearchUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Invalid source URL");
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !APPROVED_RESEARCH_HOSTS.includes(
      url.hostname.toLowerCase() as (typeof APPROVED_RESEARCH_HOSTS)[number],
    )
  ) {
    throw new Error("Source URL is outside the approved HTTPS host allowlist");
  }

  url.hash = "";
  return url;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, code: string) => {
      const point = Number(code);
      return Number.isFinite(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : " ";
    })
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) => {
      const point = Number.parseInt(code, 16);
      return Number.isFinite(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : " ";
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

export function extractPageText(source: string, contentType: string): {
  title: string;
  text: string;
} {
  if (!/html|xhtml/i.test(contentType)) {
    return { title: "", text: source.replace(/\s+/g, " ").trim() };
  }

  const title =
    decodeEntities(source.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240);

  const text = decodeEntities(
    source
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, " ")
      .replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/gi, " ")
      .replace(/<(script|style|noscript|template|svg|nav|footer)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();

  return { title, text };
}

async function readLimitedBody(response: Response): Promise<string> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_SOURCE_BYTES) {
        await reader.cancel();
        throw new Error("Source exceeds the retrieval size limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

async function fetchOne(
  input: string,
  fetchImpl: typeof fetch,
): Promise<{ url: string; title: string; excerpt: string; status: number }> {
  let current = validateResearchUrl(input);
  let response: Response | undefined;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    response = await fetchImpl(current.toString(), {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
      },
    });

    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location || redirects === MAX_REDIRECTS) {
      throw new Error("Source redirect limit reached");
    }
    current = validateResearchUrl(new URL(location, current).toString());
  }

  if (!response || !response.ok) {
    return { url: current.toString(), title: "", excerpt: "", status: response?.status ?? 0 };
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!/^(text\/html|application\/xhtml\+xml|text\/plain)(;|$)/i.test(contentType)) {
    throw new Error("Unsupported source content type");
  }

  const body = await readLimitedBody(response);
  const page = extractPageText(body, contentType);
  return {
    url: current.toString(),
    title: page.title,
    excerpt: page.text.slice(0, MAX_EXCERPT_CHARS),
    status: response.status,
  };
}

export async function fetchResearchSources(
  sourceUrls: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<Array<{ url: string; title: string; excerpt: string; status: number; error?: string }>> {
  const uniqueUrls = [...new Set(sourceUrls)].slice(0, 5);
  const results = await Promise.all(
    uniqueUrls.map(async (sourceUrl) => {
      try {
        return await fetchOne(sourceUrl, fetchImpl);
      } catch (error) {
        return {
          url: sourceUrl,
          title: "",
          excerpt: "",
          status: 0,
          error: error instanceof Error ? error.message : "Source retrieval failed",
        };
      }
    }),
  );
  return results;
}
