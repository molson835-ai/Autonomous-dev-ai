import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const token = "local-vitest-only-token";
const endpoint = "https://memory-test.invalid";

function request(path: string, init: RequestInit = {}) {
  return exports.default.fetch(
    new Request(new URL(path, endpoint), {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
    }),
  );
}

describe("persistent memory Worker HTTP contract", () => {
  it("rejects requests without the test credential", async () => {
    const response = await exports.default.fetch(
      new Request(new URL("/v1/experiences?external_id=missing", endpoint)),
    );
    expect(response.status).toBe(401);
  });

  it("stores an experience and retrieves it by exact external ID", async () => {
    const externalId = `MEMORY-CONNECTION-TEST-${crypto.randomUUID()}`;
    const record = {
      task: "Verify persistent memory round trip",
      outcome: "The isolated Worker stored and returned the exact record.",
      result: "success",
      external_id: externalId,
      evidence: "Cloudflare Workers Vitest integration HTTP response",
    };

    const write = await request("/v1/experiences", {
      method: "POST",
      body: JSON.stringify(record),
    });
    expect(write.status).toBe(201);
    const saved = await write.json<{
      id: string;
      external_id: string;
      stored: boolean;
    }>();
    expect(saved.id).toBeTruthy();
    expect(saved.external_id).toBe(externalId);
    expect(saved.stored).toBe(true);

    const recall = await request(
      `/v1/experiences?external_id=${encodeURIComponent(externalId)}`,
    );
    expect(recall.status).toBe(200);
    const recalled = await recall.json<{
      experience: {
        id: string;
        external_id: string;
        task: string;
        outcome: string;
        result: string;
        evidence: string;
      } | null;
    }>();

    expect(recalled.experience).toEqual({
      id: saved.id,
      external_id: externalId,
      task: record.task,
      outcome: record.outcome,
      result: record.result,
      evidence: record.evidence,
      created_at: expect.any(String),
    });
  });

  it("does not return a record for a similar but non-matching identifier", async () => {
    const externalId = `EXACT-ID-${crypto.randomUUID()}`;
    const write = await request("/v1/experiences", {
      method: "POST",
      body: JSON.stringify({
        task: "Test exact identifier matching",
        outcome: "Stored exact identifier.",
        result: "success",
        external_id: externalId,
      }),
    });
    expect(write.status).toBe(201);

    const recall = await request(
      `/v1/experiences?external_id=${encodeURIComponent(externalId + "-different")}`,
    );
    expect(recall.status).toBe(200);
    expect(await recall.json()).toEqual({ experience: null });
  });

  it("rejects duplicate external IDs without overwriting the first record", async () => {
    const externalId = `UNIQUE-ID-${crypto.randomUUID()}`;
    const first = await request("/v1/experiences", {
      method: "POST",
      body: JSON.stringify({
        task: "First write",
        outcome: "Original record remains authoritative.",
        result: "success",
        external_id: externalId,
      }),
    });
    expect(first.status).toBe(201);

    const duplicate = await request("/v1/experiences", {
      method: "POST",
      body: JSON.stringify({
        task: "Second write",
        outcome: "This must not overwrite the first record.",
        result: "success",
        external_id: externalId,
      }),
    });
    expect(duplicate.status).toBe(409);

    const recall = await request(
      `/v1/experiences?external_id=${encodeURIComponent(externalId)}`,
    );
    const result = await recall.json<{
      experience: { task: string } | null;
    }>();
    expect(result.experience?.task).toBe("First write");
  });

  it("keeps pending proposals separate from approved recall until explicit approval", async () => {
    const marker = `PENDING-${crypto.randomUUID().slice(0, 8)}`;
    const create = await request("/v1/proposals", {
      method: "POST",
      body: JSON.stringify({
        kind: "lesson",
        content: `Persistent learning test ${marker}`,
        source: "Isolated Worker integration test",
        confidence: 0.95,
      }),
    });
    expect(create.status).toBe(201);
    const created = await create.json<{ id: string; status: string; stored: boolean }>();
    expect(created).toMatchObject({ status: "pending", stored: true });

    const pendingList = await request("/v1/proposals?limit=20");
    expect(pendingList.status).toBe(200);
    const pending = await pendingList.json<{ proposals: Array<{ id: string; content: string; status: string }> }>();
    expect(pending.proposals.some((item) => item.id === created.id && item.status === "pending")).toBe(true);

    const beforeApproval = await request(`/v1/recall?q=${encodeURIComponent(marker)}`);
    const before = await beforeApproval.json<{ memories: Array<{ id: string }>; experiences: unknown[] }>();
    expect(before.memories.some((item) => item.id === created.id)).toBe(false);

    const decision = await request(`/v1/proposals/${created.id}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision: "approve" }),
    });
    expect(decision.status).toBe(200);
    expect(await decision.json()).toMatchObject({ id: created.id, status: "approved" });

    const afterApproval = await request(`/v1/recall?q=${encodeURIComponent(marker)}`);
    const after = await afterApproval.json<{ memories: Array<{ id: string; status: string }> }>();
    expect(after.memories.some((item) => item.id === created.id && item.status === "approved")).toBe(true);
  });

  it("keeps rejected proposals out of approved recall", async () => {
    const marker = `REJECTED-${crypto.randomUUID().slice(0, 8)}`;
    const create = await request("/v1/proposals", {
      method: "POST",
      body: JSON.stringify({
        kind: "lesson",
        content: `Rejected learning test ${marker}`,
        source: "Isolated Worker integration test",
        confidence: 0.8,
      }),
    });
    expect(create.status).toBe(201);
    const created = await create.json<{ id: string }>();

    const decision = await request(`/v1/proposals/${created.id}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision: "reject" }),
    });
    expect(decision.status).toBe(200);
    expect(await decision.json()).toMatchObject({ id: created.id, status: "rejected" });

    const recall = await request(`/v1/recall?q=${encodeURIComponent(marker)}`);
    const result = await recall.json<{ memories: Array<{ id: string }> }>();
    expect(result.memories.some((item) => item.id === created.id)).toBe(false);
  });

  it("stores and exactly retrieves success, failure, and partial experiences", async () => {
    for (const result of ["success", "failure", "partial"] as const) {
      const externalId = `RESULT-${result.toUpperCase()}-${crypto.randomUUID()}`;
      const write = await request("/v1/experiences", {
        method: "POST",
        body: JSON.stringify({
          task: `Verify ${result} experience retrieval`,
          outcome: `Observed ${result} outcome in isolated Worker test.`,
          result,
          external_id: externalId,
          evidence: "HTTP response from isolated Cloudflare Worker runtime",
        }),
      });
      expect(write.status).toBe(201);
      const saved = await write.json<{ id: string; external_id: string }>();

      const recall = await request(`/v1/experiences?external_id=${encodeURIComponent(externalId)}`);
      expect(recall.status).toBe(200);
      const found = await recall.json<{ experience: { id: string; result: string; external_id: string } | null }>();
      expect(found.experience).toMatchObject({
        id: saved.id,
        external_id: externalId,
        result,
      });
    }
  });

});
