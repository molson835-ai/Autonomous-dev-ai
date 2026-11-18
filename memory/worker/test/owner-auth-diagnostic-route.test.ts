import { exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

const endpoint = "https://memory-test.invalid";
const sharedToken = "local-vitest-only-token";
const configuredClientId = "local-owner-oauth-app";

afterEach(() => vi.unstubAllGlobals());

function callWorker(
  path: string,
  options: { method?: string; body?: unknown; credential?: string; ip?: string; origin?: string; env?: Record<string, unknown> } = {},
) {
  const headers = new Headers({
    authorization: "Bearer " + (options.credential ?? sharedToken),
    "cf-connecting-ip": options.ip ?? "203.0.113.80",
  });
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.origin) headers.set("origin", options.origin);
  const request = new Request(new URL(path, endpoint), {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  return options.env
    ? exports.default.fetch(request, options.env as never)
    : exports.default.fetch(request);
}

function diagnostic(body: unknown, options: { credential?: string; ip?: string; origin?: string; env?: Record<string, unknown> } = {}) {
  return callWorker("/v1/internal/owner-auth-diagnostic", {
    ...options,
    method: "POST",
    body,
  });
}

describe("private owner auth diagnostic endpoint", () => {
  it("rejects requests without the server shared secret", async () => {
    const response = await diagnostic(
      { access_token: "owner-token", expected_client_id: configuredClientId },
      { credential: "wrong-shared-secret", ip: "203.0.113.81" },
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ reason_code: "diagnostic_access_denied" });
  });

  it("rejects browser-originated requests even when they carry the shared secret", async () => {
    const response = await diagnostic(
      { access_token: "owner-token", expected_client_id: configuredClientId },
      { origin: "https://autonomous-dev-ai.vercel.app", ip: "203.0.113.82" },
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ reason_code: "diagnostic_access_denied" });
  });

  it("rejects malformed diagnostic payloads", async () => {
    const response = await diagnostic(
      { access_token: "owner-token", expected_client_id: configuredClientId, extra: "not-allowed" },
      { ip: "203.0.113.83" },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ reason_code: "diagnostic_request_invalid" });
  });

  it("compares Vercel and Worker Client IDs without returning either value", async () => {
    const fetchMock = vi.fn(async () => new Response("should not be called", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await diagnostic(
      { access_token: "owner-token", expected_client_id: "different-vercel-app" },
      { ip: "203.0.113.84" },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reason_code: "oauth_client_id_mismatch",
      client_id_match: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bypasses the ordinary owner failure limiter so it can identify the underlying failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 })));
    const ip = "203.0.113.85";
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const denied = await callWorker("/v1/owner/status", { ip, credential: "bad-owner-token" });
      expect(denied.status).toBe(401);
    }
    const limited = await callWorker("/v1/owner/status", { ip, credential: "bad-owner-token" });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ reason_code: "owner_auth_rate_limited" });

    const diagnosticResponse = await diagnostic(
      { access_token: "owner-token", expected_client_id: configuredClientId },
      { ip },
    );
    expect(diagnosticResponse.status).toBe(200);
    expect(await diagnosticResponse.json()).toEqual({
      reason_code: "owner_token_not_issued_by_configured_app",
      client_id_match: true,
    });
  });

  it("rate-limits repeated private diagnostic calls with a distinct reason code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 })));
    const ip = "203.0.113.86";
    const payload = { access_token: "owner-token", expected_client_id: configuredClientId };
    const first = await diagnostic(payload, { ip });
    expect(first.status).toBe(200);
    expect((await first.json()).reason_code).toBe("owner_token_not_issued_by_configured_app");

    const second = await diagnostic(payload, { ip });
    expect(second.status).toBe(429);
    expect(await second.json()).toEqual({ reason_code: "diagnostic_rate_limited" });
  });

  it("returns safe configuration reason codes before calling GitHub", async () => {
    const base = {
      MEMORY_API_TOKEN: sharedToken,
      GITHUB_CLIENT_ID: configuredClientId,
      GITHUB_CLIENT_SECRET: "local-owner-oauth-secret",
      OWNER_GITHUB_ID: "12345678",
    };

    const noVercelId = await diagnostic(
      { access_token: "owner-token", expected_client_id: "" },
      { ip: "203.0.113.88" },
    );
    expect(await noVercelId.json()).toEqual({
      reason_code: "vercel_client_id_missing",
      client_id_match: false,
    });

    const noWorkerId = await diagnostic(
      { access_token: "owner-token", expected_client_id: configuredClientId },
      { ip: "203.0.113.89", env: { ...base, GITHUB_CLIENT_ID: "" } },
    );
    expect(await noWorkerId.json()).toEqual({
      reason_code: "worker_client_id_missing",
      client_id_match: false,
    });

    const noWorkerSecret = await diagnostic(
      { access_token: "owner-token", expected_client_id: configuredClientId },
      { ip: "203.0.113.90", env: { ...base, GITHUB_CLIENT_SECRET: "" } },
    );
    expect(await noWorkerSecret.json()).toEqual({
      reason_code: "worker_client_secret_missing",
      client_id_match: true,
    });

    const badOwnerId = await diagnostic(
      { access_token: "owner-token", expected_client_id: configuredClientId },
      { ip: "203.0.113.91", env: { ...base, OWNER_GITHUB_ID: "not-numeric" } },
    );
    expect(await badOwnerId.json()).toEqual({
      reason_code: "worker_owner_id_missing_or_invalid",
      client_id_match: true,
    });

    const noToken = await diagnostic(
      { access_token: "", expected_client_id: configuredClientId },
      { ip: "203.0.113.92" },
    );
    expect(await noToken.json()).toEqual({
      reason_code: "owner_session_token_missing_or_invalid",
      client_id_match: true,
    });
  });

  it("reports a missing server shared secret without revealing configuration", async () => {
    const response = await diagnostic(
      { access_token: "owner-token", expected_client_id: configuredClientId },
      { ip: "203.0.113.93", env: { MEMORY_API_TOKEN: "" } },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ reason_code: "server_shared_secret_missing" });
  });

  it("returns success only when the app token check and immutable owner check both pass", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/applications/")) {
        return Response.json({ app: { client_id: configuredClientId } });
      }
      return Response.json({ id: 12345678, login: "owner" });
    }));
    const response = await diagnostic(
      { access_token: "owner-token", expected_client_id: configuredClientId },
      { ip: "203.0.113.87" },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reason_code: "owner_auth_ok", client_id_match: true });
  });
});
