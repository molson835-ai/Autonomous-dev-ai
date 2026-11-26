import { exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

const token = "local-vitest-only-token";
const endpoint = "https://memory-test.invalid";
const ownerToken = "local-vitest-only-owner-token";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function request(path, init = {}, credential = token) {
  if (credential === ownerToken) {
    vi.stubGlobal("fetch", vi.fn(async (input) => {
      if (String(input).includes("/applications/local-owner-oauth-app/token")) return Response.json({ app: { client_id: "local-owner-oauth-app" } });
      return Response.json({ id: 12345678, login: "renamed-owner-login" });
    }));
  } else if (credential === token) {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unauthorized", { status: 401 })));
  }
  return exports.default.fetch(new Request(new URL(path, endpoint), {
    ...init,
    headers: {
      authorization: "Bearer " + credential,
      ...(init.body ? { "content-type": "application/json" } : {}),
      "cf-connecting-ip": credential === token ? "203.0.113.2" : "203.0.113.1",
      ...init.headers,
    },
  }));
}

const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Test artifact</title></head><body><main><h1>Reusable report</h1></main></body></html>';

describe("durable owner-visible artifacts", () => {
  it("persists validated HTML and returns stable metadata", async () => {
    const created = await request("/v1/artifacts", { method: "POST", body: JSON.stringify({ name: "Research report", content: html }) });
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body).toMatchObject({ stored: true, artifact: { name: "Research report", filename: "Research-report.html", media_type: "text/html" } });
    expect(body.artifact.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("allows the authenticated agent service to retrieve stored content", async () => {
    const created = await request("/v1/artifacts", { method: "POST", body: JSON.stringify({ name: "Research report", content: html }) });
    const { artifact } = await created.json();
    const retrieved = await request("/v1/artifacts/" + artifact.id);
    expect(retrieved.status).toBe(200);
    expect(await retrieved.json()).toMatchObject({ artifact: { id: artifact.id, content: expect.stringContaining("Content-Security-Policy") } });
  });

  it("exposes metadata and content only to the verified owner", async () => {
    const created = await request("/v1/artifacts", { method: "POST", body: JSON.stringify({ name: "Research report", content: html }) });
    const { artifact } = await created.json();
    const denied = await request("/v1/owner/artifacts", {}, token);
    expect(denied.status).toBe(401);
    const list = await request("/v1/owner/artifacts", {}, ownerToken);
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({ artifacts: [expect.objectContaining({ id: artifact.id, name: "Research report" })] });
    const detail = await request("/v1/owner/artifacts/" + artifact.id, {}, ownerToken);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ artifact: { id: artifact.id, content: expect.stringContaining("Reusable report") } });
  });

  it("rejects invalid HTML before persistence", async () => {
    const response = await request("/v1/artifacts", { method: "POST", body: JSON.stringify({ name: "Bad", content: "<script>alert(1)</script>" }) });
    expect(response.status).toBe(400);
    const list = await request("/v1/owner/artifacts", {}, ownerToken);
    expect((await list.json()).artifacts).toHaveLength(1);
  });

  it("enforces the 25-artifact item cap", async () => {
    for (let i = 0; i < 25; i++) {
      const response = await request("/v1/artifacts", { method: "POST", body: JSON.stringify({ name: "Report " + i, content: html }) });
      expect(response.status).toBe(201);
    }
    const blocked = await request("/v1/artifacts", { method: "POST", body: JSON.stringify({ name: "Overflow", content: html }) });
    expect(blocked.status).toBe(429);
  });

  it("requires owner confirmation path for deletion and preserves other artifacts", async () => {
    const created = await request("/v1/artifacts", { method: "POST", body: JSON.stringify({ name: "Delete me", content: html }) });
    const { artifact } = await created.json();
    const denied = await request("/v1/owner/artifacts/" + artifact.id + "/delete", { method: "POST" }, token);
    expect(denied.status).toBe(401);
    const deleted = await request("/v1/owner/artifacts/" + artifact.id + "/delete", { method: "POST" }, ownerToken);
    expect(deleted.status).toBe(200);
    const missing = await request("/v1/owner/artifacts/" + artifact.id, {}, ownerToken);
    expect(missing.status).toBe(404);
  });
});
