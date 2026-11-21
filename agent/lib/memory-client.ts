import { memoryFailureDiagnostic } from "./quota-error.mjs";
import { env } from "node:process";

type MemoryRequestInit = {
  method?: "GET" | "POST";
  body?: unknown;
};

export async function memoryRequest<T>(
  path: string,
  init: MemoryRequestInit = {},
): Promise<T> {
  const baseUrl = env.MEMORY_API_URL;
  const token = env.MEMORY_API_TOKEN;

  if (!baseUrl || !token) {
    throw new Error("Persistent memory is not configured. Do not claim anything was saved or recalled.");
  }

  let endpoint: URL;
  try {
    endpoint = new URL(path.replace(/^\/+/, ""), baseUrl.endsWith("/") ? baseUrl : baseUrl + "/");
  } catch {
    throw new Error("Persistent memory URL is invalid.");
  }

  if (endpoint.protocol !== "https:") {
    throw new Error("Persistent memory requires an HTTPS endpoint.");
  }

  const response = await fetch(endpoint, {
    method: init.method ?? "GET",
    headers: {
      authorization: "Bearer " + token,
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(7000),
    cache: "no-store",
  });

  if (!response.ok) {
    let payload: unknown = null;
    try { payload = await response.json(); } catch { /* Keep the safe generic status message. */ }
    const diagnostic = memoryFailureDiagnostic(response.status, payload, path);
    const error = new Error(diagnostic.message);
    error.name = diagnostic.name;
    Object.assign(error, {
      status: diagnostic.status,
      category: diagnostic.category,
      reason_code: diagnostic.reason_code,
    });
    throw error;
  }
  return (await response.json()) as T;
}
