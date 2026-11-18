import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compareOwnerClientId,
  ownerAuthConfigurationReason,
  verifyOwnerGithubToken,
  type OwnerAuthEnvironment,
} from "../src/owner-auth";

afterEach(() => vi.unstubAllGlobals());

const configured: OwnerAuthEnvironment = {
  GITHUB_CLIENT_ID: "test-oauth-app",
  GITHUB_CLIENT_SECRET: "test-oauth-secret",
  OWNER_GITHUB_ID: "12345678",
};

function stubSuccessfulGithub() {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("/applications/")) {
      return Response.json({ app: { client_id: "test-oauth-app" } });
    }
    return Response.json({ id: 12345678, login: "owner" });
  }));
}

describe("owner OAuth diagnostic reason codes", () => {
  it("reports a missing Vercel Client ID distinctly", () => {
    expect(compareOwnerClientId("", "test-oauth-app")).toBe("vercel_client_id_missing");
  });

  it("reports a missing Worker Client ID distinctly", () => {
    expect(compareOwnerClientId("test-oauth-app", "")).toBe("worker_client_id_missing");
  });

  it("reports an exact Client ID mismatch without exposing either value", () => {
    expect(compareOwnerClientId("vercel-app", "worker-app")).toBe("oauth_client_id_mismatch");
  });

  it("accepts an exact Client ID match", () => {
    expect(compareOwnerClientId("test-oauth-app", "test-oauth-app")).toBe("match");
  });

  it("reports a missing Worker Client ID in the auth configuration", () => {
    expect(ownerAuthConfigurationReason({ ...configured, GITHUB_CLIENT_ID: "" }))
      .toBe("worker_client_id_missing");
  });

  it("reports a missing Worker OAuth secret", () => {
    expect(ownerAuthConfigurationReason({ ...configured, GITHUB_CLIENT_SECRET: "" }))
      .toBe("worker_client_secret_missing");
  });

  it("reports a missing or invalid immutable owner ID", () => {
    expect(ownerAuthConfigurationReason({ ...configured, OWNER_GITHUB_ID: "not-a-number" }))
      .toBe("worker_owner_id_missing_or_invalid");
  });

  it("reports a missing or malformed owner session token", async () => {
    expect(await verifyOwnerGithubToken("", configured)).toBe("owner_session_token_missing_or_invalid");
    expect(await verifyOwnerGithubToken("x".repeat(4097), configured)).toBe("owner_session_token_missing_or_invalid");
  });

  it("reports rejected OAuth app credentials separately", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unauthorized", { status: 401 })));
    expect(await verifyOwnerGithubToken("owner-token", configured)).toBe("oauth_app_credentials_rejected");
  });

  it("reports tokens not issued to the configured app", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 })));
    expect(await verifyOwnerGithubToken("owner-token", configured)).toBe("owner_token_not_issued_by_configured_app");

    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ app: { client_id: "different-app" } })));
    expect(await verifyOwnerGithubToken("owner-token", configured)).toBe("owner_token_not_issued_by_configured_app");
  });

  it("reports unexpected OAuth token-check responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("forbidden", { status: 403 })));
    expect(await verifyOwnerGithubToken("owner-token", configured)).toBe("github_oauth_check_failed");
  });

  it("reports OAuth API outages separately", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));
    expect(await verifyOwnerGithubToken("owner-token", configured)).toBe("github_oauth_api_unavailable");

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network unavailable"); }));
    expect(await verifyOwnerGithubToken("owner-token", configured)).toBe("github_oauth_api_unavailable");
  });

  it("reports GitHub user verification failures separately", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/applications/")) return Response.json({ app: { client_id: "test-oauth-app" } });
      return new Response("unauthorized", { status: 401 });
    }));
    expect(await verifyOwnerGithubToken("owner-token", configured)).toBe("github_user_verification_failed");
  });

  it("reports GitHub user API outages separately", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/applications/")) return Response.json({ app: { client_id: "test-oauth-app" } });
      return new Response("unavailable", { status: 503 });
    }));
    expect(await verifyOwnerGithubToken("owner-token", configured)).toBe("github_user_api_unavailable");

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/applications/")) return Response.json({ app: { client_id: "test-oauth-app" } });
      throw new Error("network unavailable");
    }));
    expect(await verifyOwnerGithubToken("owner-token", configured)).toBe("github_user_api_unavailable");
  });

  it("reports immutable owner ID mismatches", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/applications/")) return Response.json({ app: { client_id: "test-oauth-app" } });
      return Response.json({ id: 87654321, login: "similar-login" });
    }));
    expect(await verifyOwnerGithubToken("owner-token", configured)).toBe("owner_id_mismatch");
  });

  it("accepts only a token from the configured app and immutable owner", async () => {
    stubSuccessfulGithub();
    expect(await verifyOwnerGithubToken("owner-token", configured)).toBe("owner_auth_ok");
  });
});
