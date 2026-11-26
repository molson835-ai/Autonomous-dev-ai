import { exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, test, vi } from "vitest";

const token = "local-vitest-only-token";
const endpoint = "https://memory-test.invalid";
const ownerToken = "local-vitest-only-owner-token";

afterEach(async () => {
  try {
    while (true) {
      const listed = await request("/v1/owner/artifacts?limit=20", {}, ownerToken);
      if (!listed.ok) break;
      const { artifacts } = await listed.json();
      if (!artifacts.length) break;
      for (const artifact of artifacts) {
        await request("/v1/owner/artifacts/" + artifact.id + "/delete", { method: "POST" }, ownerToken);
      }
    }
  } finally {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});

function request(path: string, init: RequestInit = {}, credential = token) {
  if (path === "/v1/artifacts" && init.method === "POST" && typeof init.body === "string") {
    const payload = JSON.parse(init.body);
    if (!payload.idempotency_key) payload.idempotency_key = crypto.randomUUID();
    init = { ...init, body: JSON.stringify(payload) };
  }
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

  it("returns the original artifact for an identical idempotent retry", async () => {
    const idempotencyKey = crypto.randomUUID();
    const payload = { name: "Retry-safe report", content: html, idempotency_key: idempotencyKey };
    const first = await request("/v1/artifacts", { method: "POST", body: JSON.stringify(payload) });
    expect(first.status).toBe(201);
    const firstBody = await first.json();
    expect(firstBody.artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    const retry = await request("/v1/artifacts", { method: "POST", body: JSON.stringify(payload) });
    expect(retry.status).toBe(200);
    const retryBody = await retry.json();
    expect(retryBody.duplicate).toBe(true);
    expect(retryBody.artifact.id).toBe(firstBody.artifact.id);
    const list = await request("/v1/owner/artifacts", {}, ownerToken);
    expect((await list.json()).artifacts).toHaveLength(1);
  });

  it("rejects reuse of an idempotency key with different content", async () => {
    const idempotency_key = crypto.randomUUID();
    const first = await request("/v1/artifacts", { method: "POST", body: JSON.stringify({ name: "Original", content: html, idempotency_key }) });
    expect(first.status).toBe(201);
    const changed = html.replace("Reusable report", "Changed report");
    const conflict = await request("/v1/artifacts", { method: "POST", body: JSON.stringify({ name: "Original", content: changed, idempotency_key }) });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ reason_code: "artifact_idempotency_conflict" });
  });

  it("allows the authenticated agent service to retrieve stored content", async () => {
    const created = await request("/v1/artifacts", { method: "POST", body: JSON.stringify({ name: "Research report", content: html }) });
    const { artifact } = await created.json();
    const retrieved = await request("/v1/artifacts/" + artifact.id);
    expect(retrieved.status).toBe(200);
    const retrievedBody = await retrieved.json();
    expect(retrievedBody.artifact).toMatchObject({ id: artifact.id, content: expect.stringContaining("Content-Security-Policy") });
    expect(retrievedBody.artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("exposes metadata and content only to the verified owner", async () => {
    const created = await request("/v1/artifacts", { method: "POST", body: JSON.stringify({ name: "Research report", content: html }) });
    const { artifact } = await created.json();
    const denied = await request("/v1/owner/artifacts", {}, token);
    expect(denied.status).toBe(401);
    const list = await request("/v1/owner/artifacts", {}, ownerToken);
    expect(list.status).toBe(200);
    const listed = await list.json();
    expect(listed.artifacts).toContainEqual(expect.objectContaining({ id: artifact.id, name: "Research report" }));
    expect(listed.artifacts[0]).not.toHaveProperty("content");
    const detail = await request("/v1/owner/artifacts/" + artifact.id, {}, ownerToken);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ artifact: { id: artifact.id, content: expect.stringContaining("Reusable report") } });
  });

  it("rejects invalid HTML before persistence", async () => {
    const response = await request("/v1/artifacts", { method: "POST", body: JSON.stringify({ name: "Bad", content: "<script>alert(1)</script>" }) });
    expect(response.status).toBe(400);
    const list = await request("/v1/owner/artifacts", {}, ownerToken);
    expect((await list.json()).artifacts).toHaveLength(0);
  });

  it("enforces the 20-artifact item cap", async () => {
    for (let i = 0; i < 20; i++) {
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

test("rejects an oversized request body while preserving the storage limit", async () => {
  const oversized = html.replace("</main>", "<p>" + "x".repeat(100_000) + "</p></main>");
  const response = await request("/v1/artifacts", { method: "POST", body: JSON.stringify({ name: "Too large", content: oversized }) });
  expect(response.status).toBe(400);
  const list = await request("/v1/owner/artifacts", {}, ownerToken);
  expect((await list.json()).artifacts).toHaveLength(0);
});

test("enforces the one-megabyte aggregate content cap", async () => {
  const largeHtml = html.replace("</main>", "<p>" + "x".repeat(60_000) + "</p></main>");
  let stored = 0;
  for (let i = 0; i < 20; i++) {
    const response = await request("/v1/artifacts", { method: "POST", body: JSON.stringify({ name: "Large " + i, content: largeHtml }) });
    if (response.status === 429) break;
    expect(response.status).toBe(201);
    stored++;
  }
  expect(stored).toBeGreaterThan(0);
  expect(stored).toBeLessThan(25);
  const blocked = await request("/v1/artifacts", { method: "POST", body: JSON.stringify({ name: "Aggregate overflow", content: largeHtml }) });
  expect(blocked.status).toBe(429);
});
