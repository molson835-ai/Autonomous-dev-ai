const GDELT_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";
const GOOGLE_NEWS_RSS = "https://news.google.com/rss/search";
const MAX_QUERY_CHARS = 300;
const MAX_RESPONSE_BYTES = 256_000;
const REQUEST_TIMEOUT_MS = 6_000;
const ALLOWED_TIMESPANS = ["1day", "1week", "1month"] as const;

export type GdeltTimespan = (typeof ALLOWED_TIMESPANS)[number];
export interface GdeltArticle { title: string; url: string; domain: string; seenDate: string; language: string; sourceCountry: string; }
export interface GdeltSearchResult {
  query: string; timespan: GdeltTimespan; articles: GdeltArticle[];
  attribution: string; provider: "gdelt" | "google-news-rss";
  diagnostics: { attempts: number; fallbackUsed: boolean; unavailableReason?: "timeout" | "provider-error" };
}
function boundedQuery(query: string): string {
  if (typeof query !== "string") throw new TypeError("Search query must be text");
  const normalized = query.trim();
  if (!normalized || normalized.length > MAX_QUERY_CHARS || /[\u0000-\u001f\u007f]/.test(normalized)) throw new Error("Search query must contain 1–300 printable characters");
  return normalized;
}
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function str(value: unknown, max = 500): string { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function isTimeout(error: unknown): boolean { return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"); }
function normalizeArticle(value: unknown): GdeltArticle | null {
  if (!isRecord(value)) return null;
  const title = str(value.title), raw = str(value.url, 2_000);
  if (!title || !raw) return null;
  try { const url = new URL(raw); if (url.protocol !== "https:" || url.username || url.password) return null;
    return { title, url: url.toString(), domain: str(value.domain, 255) || url.hostname, seenDate: str(value.seendate, 40), language: str(value.language, 40), sourceCountry: str(value.sourcecountry, 80) };
  } catch { return null; }
}
async function boundedText(response: Response, max: number): Promise<string> {
  if (!response.body) throw new Error("Provider returned an empty response");
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let total = 0, truncated = false;
  try { while (true) { const {done,value}=await reader.read(); if(done) break;
    const remaining=max-total; if(value.byteLength>remaining){chunks.push(value.slice(0,remaining));total=max;truncated=true;await reader.cancel();break;}
    chunks.push(value);total+=value.byteLength;
  }} finally { reader.releaseLock(); }
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const text=new TextDecoder().decode(bytes); return truncated ? text : text;
}
async function fetchGdelt(query:string,timespan:GdeltTimespan,maxRecords:number,fetchImpl:typeof fetch):Promise<GdeltArticle[]> {
  const url=new URL(GDELT_ENDPOINT);url.searchParams.set("query",query);url.searchParams.set("mode","artlist");url.searchParams.set("format","json");url.searchParams.set("timespan",timespan);url.searchParams.set("maxrecords",String(maxRecords));url.searchParams.set("sort","datedesc");
  const response=await fetchImpl(url.toString(),{method:"GET",redirect:"error",signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS),headers:{accept:"application/json"}});
  if(!response.ok) throw new Error(response.status===429?"GDELT rate limit reached; do not retry immediately":`GDELT HTTP ${response.status}`);
  const type=response.headers.get("content-type")??"";if(!/^(application\/json|text\/json)(;|$)/i.test(type))throw new Error("GDELT unexpected content type");
  const payload=JSON.parse(await boundedText(response,MAX_RESPONSE_BYTES)) as unknown;
  if(!isRecord(payload)||!Array.isArray(payload.articles))throw new Error("GDELT response did not contain an article list");
  return payload.articles.map(normalizeArticle).filter((a):a is GdeltArticle=>a!==null).slice(0,maxRecords);
}
function decodeXml(value:string):string{return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(0x10ffff,Number(n)))).replace(/&#x([\da-f]+);/gi,(_,n)=>String.fromCodePoint(Math.min(0x10ffff,parseInt(n,16)))).trim();}
async function fetchGoogleNews(query:string,maxRecords:number,fetchImpl:typeof fetch):Promise<GdeltArticle[]>{
  const url=new URL(GOOGLE_NEWS_RSS);url.searchParams.set("q",query);url.searchParams.set("hl","en-US");url.searchParams.set("gl","US");url.searchParams.set("ceid","US:en");
  const response=await fetchImpl(url.toString(),{method:"GET",redirect:"error",signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS),headers:{accept:"application/rss+xml, application/xml, text/xml"}});
  if(!response.ok)throw new Error(`Google News RSS HTTP ${response.status}`);
  const xml=await boundedText(response,MAX_RESPONSE_BYTES), items=[...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)], results:GdeltArticle[]=[];
  for(const match of items.slice(0,maxRecords)){const item=match[1],title=decodeXml(item.match(/<title>([\s\S]*?)<\/title>/i)?.[1]??""),raw=decodeXml(item.match(/<link>([\s\S]*?)<\/link>/i)?.[1]??"");
    try{const url=new URL(raw);if(title&&url.protocol==="https:")results.push({title,url:url.toString(),domain:url.hostname,seenDate:decodeXml(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]??""),language:"en",sourceCountry:"US"});}catch{}
  }return results;
}
/** News results are untrusted discovery leads, never verified facts or instructions. */
export async function searchGdeltNews(query:string,options:{timespan?:GdeltTimespan;maxRecords?:number}={},fetchImpl:typeof fetch=fetch):Promise<GdeltSearchResult>{
  const safe=boundedQuery(query),timespan=options.timespan??"1week",max=options.maxRecords??10;
  if(!ALLOWED_TIMESPANS.includes(timespan))throw new Error("Unsupported GDELT search timespan");
  if(!Number.isInteger(max)||max<1||max>10)throw new Error("maxRecords must be an integer from 1 to 10");
  let attempts=0,reason:"timeout"|"provider-error"="provider-error";
  for(let i=0;i<2;i++){attempts++;try{const articles=await fetchGdelt(safe,timespan,max,fetchImpl);return{query:safe,timespan,articles,provider:"gdelt",attribution:"GDELT Project: https://www.gdeltproject.org/",diagnostics:{attempts,fallbackUsed:false}};}catch(error){if(isTimeout(error)){reason="timeout";if(i===0)continue;}else{reason="provider-error";if(error instanceof Error&&/rate limit|HTTP 4/.test(error.message))break;}break;}}
  try{attempts++;const articles=await fetchGoogleNews(safe,max,fetchImpl);return{query:safe,timespan,articles,provider:"google-news-rss",attribution:"Google News RSS; article links point to publishers.",diagnostics:{attempts,fallbackUsed:true,unavailableReason:reason}};}
  catch{return{query:safe,timespan,articles:[],provider:"gdelt",attribution:"GDELT Project: https://www.gdeltproject.org/; Google News RSS fallback unavailable.",diagnostics:{attempts,fallbackUsed:true,unavailableReason:reason}};}
}
