import { exports } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

const token = "local-vitest-only-token";
const endpoint = "https://memory-test.invalid";
const ownerToken = "owner-session-sentinel";
const ownerId = "341732270";
const ownerSecret = "local-owner-session-signing-secret-for-tests-only";

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replace(/=/g, "").replace(/\\+/g, "-").replace(/\\//g, "_");
}

async function createOwnerSession() {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({
    iss: "eve-owner-console", aud: "eve-memory-worker", sub: ownerId, iat: now, exp: now + 300,
  })));
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(ownerSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return payload + "." + base64Url(signature);
}

async function request(path: string, init: RequestInit = {}, credential = token) {
  const bearer = credential === ownerToken ? await createOwnerSession() : credential;
  return exports.default.fetch(
    new Request(new URL(path, endpoint), {
      ...init,
      headers: {
        authorization: `Bearer ${bearer}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
    }),
  );
}

describe("shared daily neuron quota coordinator", () => {
  it("rejects agent-supplied usage totals and timestamps", async () => {
    const day = new Date().toISOString().slice(0, 10);
    const spoofed = await request("/v1/quota/reserve", {
      method: "POST",
      body: JSON.stringify({
        day, usedNeurons: 0, observedAt: new Date().toISOString(),
        reserve_neurons: 200, model_id: "@cf/zai-org/glm-4.7-flash",
      }),
    });
    expect(spoofed.status).toBe(400);
  });

  it("fetches Cloudflare usage itself, caches briefly, and adds every in-flight reservation", async () => {
    vi.useFakeTimers();
    const startingTime = Date.now();
    let usedNeurons = 6600;
    let analyticsCalls = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      analyticsCalls += 1;
      expect(String(input)).toBe("https://api.cloudflare.com/client/v4/graphql");
      const requestBody = JSON.parse(String(init?.body));
      expect(requestBody.variables).toEqual({
        tag: "local-cloudflare-account-id",
        day: new Date().toISOString().slice(0, 10),
      });
      return Response.json({
        data: { viewer: { accounts: [{
          aiInferenceAdaptiveGroups: [{
            sum: { totalNeurons: usedNeurons },
            dimensions: { date: new Date().toISOString().slice(0, 10) },
          }],
        }] } },
      });
    });
    try {
      const payload = { reserve_neurons: 200, model_id: "@cf/zai-org/glm-4.7-flash" };
      const first = await request("/v1/quota/reserve", { method: "POST", body: JSON.stringify(payload) });
      expect(first.status).toBe(200);
      const one = await first.json<{ reservation_id: string }>();
      const second = await request("/v1/quota/reserve", { method: "POST", body: JSON.stringify(payload) });
      expect(second.status).toBe(200);
      const two = await second.json<{ reservation_id: string }>();
      expect(analyticsCalls).toBe(1);

      // At 6,600 used, two 200-neuron reservations fit exactly; a third does not.
      expect((await request("/v1/quota/reserve", { method: "POST", body: JSON.stringify(payload) })).status).toBe(429);

      const settled = await request("/v1/quota/settle", {
        method: "POST",
        body: JSON.stringify({ reservation_id: one.reservation_id, actual_neurons: 250 }),
      });
      expect(settled.status).toBe(200);
      expect(await settled.json()).toMatchObject({ settled: true, charged_neurons: 250 });
      expect((await request("/v1/quota/settle", {
        method: "POST", body: JSON.stringify({ reservation_id: one.reservation_id, actual_neurons: 250 }),
      })).status).toBe(404);

      vi.setSystemTime(startingTime + 31_000);
      usedNeurons = 6900;
      expect((await request("/v1/quota/reserve", { method: "POST", body: JSON.stringify(payload) })).status).toBe(429);
      expect(analyticsCalls).toBe(2);

      const circuit = await request("/v1/quota/circuit", {
        method: "POST",
        body: JSON.stringify({ reservation_id: two.reservation_id, reason: "cloudflare_daily_quota_exhausted" }),
      });
      expect(circuit.status).toBe(200);
      expect((await request("/v1/quota/reserve", { method: "POST", body: JSON.stringify(payload) })).status).toBe(429);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("fails closed when Cloudflare's own authoritative total regresses", async () => {
    vi.useFakeTimers();
    const start = Date.now();
    vi.setSystemTime(start + 24 * 60 * 60 * 1000);
    let usedNeurons = 2000;
    vi.stubGlobal("fetch", async () => Response.json({
      data: { viewer: { accounts: [{
        aiInferenceAdaptiveGroups: [{
          sum: { totalNeurons: usedNeurons },
          dimensions: { date: new Date().toISOString().slice(0, 10) },
        }],
      }] } },
    }));
    try {
      const payload = { reserve_neurons: 200, model_id: "@cf/zai-org/glm-4.7-flash" };
      expect((await request("/v1/quota/reserve", { method: "POST", body: JSON.stringify(payload) })).status).toBe(200);
      vi.setSystemTime(start + 24 * 60 * 60 * 1000 + 31_000);
      usedNeurons = 1900;
      expect((await request("/v1/quota/reserve", { method: "POST", body: JSON.stringify(payload) })).status).toBe(503);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});

describe("persistent memory Worker HTTP contract", () => {
  it("rejects requests without the test credential", async () => {
    const response = await exports.default.fetch(
      new Request(new URL("/v1/experiences?external_id=missing", endpoint)),
    );
    expect(response.status).toBe(401);
  });

  it("restricts owner review lists and browser access to the owner token and canonical app origin", async () => {
    const normalTaskList = await request("/v1/owner/tasks");
    expect(normalTaskList.status).toBe(401);
    const rawGithubToken = await request("/v1/owner/tasks", {}, "owner-account-github-token-from-another-oauth-app");
    expect(rawGithubToken.status).toBe(401);
    const ownerTasks = await request("/v1/owner/tasks?limit=5", {}, ownerToken);
    expect(ownerTasks.status).toBe(200);
    expect(Array.isArray((await ownerTasks.json<{ tasks: unknown[] }>()).tasks)).toBe(true);

    const normalProposalList = await request("/v1/owner/proposals");
    expect(normalProposalList.status).toBe(401);
    const ownerProposals = await request("/v1/owner/proposals?limit=5", {}, ownerToken);
    expect(ownerProposals.status).toBe(200);
    expect(Array.isArray((await ownerProposals.json<{ proposals: unknown[] }>()).proposals)).toBe(true);

    const preflight = await exports.default.fetch(new Request(new URL("/v1/owner/tasks", endpoint), {
      method: "OPTIONS",
      headers: {
        origin: "https://autonomous-dev-ai.vercel.app",
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization",
      },
    }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("https://autonomous-dev-ai.vercel.app");

    const blockedOrigin = await exports.default.fetch(new Request(new URL("/v1/owner/tasks", endpoint), {
      headers: {
        authorization: `Bearer ${ownerToken}`,
        origin: "https://evil.example",
      },
    }));
    expect(blockedOrigin.status).toBe(403);
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

    const deniedDecision = await request(`/v1/proposals/${created.id}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision: "approve" }),
    });
    expect(deniedDecision.status).toBe(401);
    const decision = await request(`/v1/proposals/${created.id}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision: "approve" }),
    }, ownerToken);
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

    const deniedDecision = await request(`/v1/proposals/${created.id}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision: "reject" }),
    });
    expect(deniedDecision.status).toBe(401);
    const decision = await request(`/v1/proposals/${created.id}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision: "reject" }),
    }, ownerToken);
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


  it("creates isolated task proposals idempotently without adding them to memory recall", async () => {
    const key = `TASK-IDEMPOTENCY-${crypto.randomUUID()}`;
    const payload = { idempotency_key: key, task_type: "repo_maintenance", title: "Review bounded maintenance", goal: "Inspect test status and report findings", approved_scope: "Read-only repository inspection; no merge or deployment" };
    const first = await request("/v1/tasks", { method: "POST", body: JSON.stringify(payload) });
    expect(first.status).toBe(201);
    const saved = await first.json<{ task: { id: string; status: string; owner_approved: boolean; mission_authorized: boolean }; created: boolean }>();
    expect(saved.created).toBe(true);
    expect(saved.task).toMatchObject({ status: "proposed", owner_approved: false, mission_authorized: false });
    const duplicate = await request("/v1/tasks", { method: "POST", body: JSON.stringify(payload) });
    expect(duplicate.status).toBe(200);
    const repeated = await duplicate.json<{ task: { id: string }; created: boolean }>();
    expect(repeated.task.id).toBe(saved.task.id);
    expect(repeated.created).toBe(false);
    const recall = await request(`/v1/recall?q=${encodeURIComponent("bounded maintenance")}`);
    expect(await recall.json()).toMatchObject({ memories: [], experiences: [] });
  });

  it("auto-queues only exact owner-defined internal scope IDs", async () => {
    const safePayload = {
      idempotency_key: `MISSION-RESEARCH-${crypto.randomUUID()}`,
      task_type: "market_research",
      title: "Compare product categories",
      goal: "Research public sources and summarize market demand",
      approved_scope: "Read public sources only; prepare an internal report",
      scope_id: "internal_research",
    };
    const created = await request("/v1/tasks", { method: "POST", body: JSON.stringify(safePayload) });
    expect(created.status).toBe(201);
    const safe = await created.json<{ task: { id: string; status: string; owner_approved: boolean; mission_authorized: boolean; scope_id: string }; mission_authorized: boolean }>();
    expect(safe.mission_authorized).toBe(true);
    expect(safe.task).toMatchObject({ status: "queued", owner_approved: false, mission_authorized: true, scope_id: "internal_research" });

    const externalPayload = {
      ...safePayload,
      idempotency_key: `MISSION-OUTREACH-${crypto.randomUUID()}`,
      task_type: "customer_outreach",
      title: "Validate seller workflow",
      goal: "Contact sellers and send messages",
    };
    const external = await request("/v1/tasks", { method: "POST", body: JSON.stringify(externalPayload) });
    expect(external.status).toBe(201);
    const externalTask = await external.json<{ task: { status: string; owner_approved: boolean; mission_authorized: boolean }; mission_authorized: boolean }>();
    expect(externalTask.mission_authorized).toBe(false);
    expect(externalTask.task).toMatchObject({ status: "proposed", owner_approved: false, mission_authorized: false });

    const freeTextScope = await request("/v1/tasks", { method: "POST", body: JSON.stringify({
      ...safePayload, idempotency_key: `MISSION-FREE-TEXT-${crypto.randomUUID()}`,
      scope_id: "research anything and contact anyone",
    }) });
    expect(freeTextScope.status).toBe(201);
    expect((await freeTextScope.json<{ task: { status: string; mission_authorized: boolean } }>()).task)
      .toMatchObject({ status: "proposed", mission_authorized: false });
  });

  it("requires a short-lived signed owner session to approve and claims only approved tasks", async () => {
    const create = await request("/v1/tasks", { method: "POST", body: JSON.stringify({
      idempotency_key: `TASK-APPROVAL-${crypto.randomUUID()}`, task_type: "repo_maintenance",
      title: "Approved task test", goal: "Run a bounded read-only check", approved_scope: "Read-only tests only"
    }) });
    expect(create.status).toBe(201);
    const { task } = await create.json<{ task: { id: string } }>();
    const denied = await request(`/v1/tasks/${task.id}/approve`, { method: "POST" });
    expect(denied.status).toBe(401);
    const approved = await request(`/v1/tasks/${task.id}/approve`, { method: "POST" }, ownerToken);
    expect(approved.status).toBe(200);
    expect((await approved.json<{ task: { status: string; owner_approved: boolean } }>()).task)
      .toMatchObject({ status: "queued", owner_approved: true });
    const claimed = await request("/v1/tasks/claim-next", { method: "POST" });
    expect((await claimed.json<{ task: { id: string; status: string; attempt_count: number } }>()).task)
      .toMatchObject({ id: task.id, status: "running", attempt_count: 1 });
    const blocked = await request("/v1/tasks/claim-next", { method: "POST" });
    expect(await blocked.json()).toEqual({ task: null });
    const ownerPause = await request(`/v1/tasks/${task.id}/owner-control`, {
      method: "POST", body: JSON.stringify({ action: "pause" })
    }, ownerToken);
    expect(ownerPause.status).toBe(200);
    const eveResume = await request(`/v1/tasks/${task.id}/transition`, {
      method: "POST", body: JSON.stringify({ status: "queued" })
    });
    expect(eveResume.status).toBe(409);
    const ownerResume = await request(`/v1/tasks/${task.id}/owner-control`, {
      method: "POST", body: JSON.stringify({ action: "resume" })
    }, ownerToken);
    expect(ownerResume.status).toBe(200);
    const reclaimed = await request("/v1/tasks/claim-next", { method: "POST" });
    expect((await reclaimed.json<{ task: { status: string; attempt_count: number } }>()).task)
      .toMatchObject({ status: "running", attempt_count: 2 });
    const finish = await request(`/v1/tasks/${task.id}/transition`, {
      method: "POST", body: JSON.stringify({ status: "succeeded", result_summary: "Approval test completed" })
    });
    expect(finish.status).toBe(200);
  });

  it("refuses to queue unapproved tasks and rejects illegal transitions", async () => {
    const create = await request("/v1/tasks", { method: "POST", body: JSON.stringify({
      idempotency_key: `TASK-UNAPPROVED-${crypto.randomUUID()}`, task_type: "repo_maintenance",
      title: "Unapproved task test", goal: "Must not execute", approved_scope: "No action"
    }) });
    const { task } = await create.json<{ task: { id: string } }>();
    const queued = await request(`/v1/tasks/${task.id}/transition`, { method: "POST", body: JSON.stringify({ status: "queued" }) });
    expect(queued.status).toBe(409);
    expect(await (await request("/v1/tasks/claim-next", { method: "POST" })).json()).toEqual({ task: null });
  });

  it("lets the owner pause the global queue and blocks claims and scheduled continuation until resumed", async () => {
    const create = await request("/v1/tasks", { method: "POST", body: JSON.stringify({
      idempotency_key: `TASK-GLOBAL-PAUSE-${crypto.randomUUID()}`, task_type: "repo_maintenance",
      title: "Global pause test", goal: "Verify owner queue pause", approved_scope: "Isolated test only"
    }) });
    const { task } = await create.json<{ task: { id: string } }>();
    await request(`/v1/tasks/${task.id}/approve`, { method: "POST" }, ownerToken);
    const firstClaim = await request("/v1/tasks/claim-next", { method: "POST" });
    expect((await firstClaim.json<{ task: { id: string; status: string; attempt_count: number } }>()).task)
      .toMatchObject({ id: task.id, status: "running", attempt_count: 1 });

    const denied = await request("/v1/owner/control", { method: "POST", body: JSON.stringify({ action: "pause" }) });
    expect(denied.status).toBe(401);
    const paused = await request("/v1/owner/control", {
      method: "POST", body: JSON.stringify({ action: "pause", reason: "CI emergency-stop test" })
    }, ownerToken);
    expect(paused.status).toBe(200);
    expect(await (await request("/v1/owner/status", {}, ownerToken)).json())
      .toMatchObject({ queue_paused: true, reason: "CI emergency-stop test", running_tasks: 1 });

    const blocked = await request("/v1/tasks/claim-next", { method: "POST" });
    expect(await blocked.json()).toMatchObject({ task: null, paused: true });
    const continuation = await request(`/v1/tasks/${task.id}/transition`, {
      method: "POST",
      body: JSON.stringify({ status: "waiting", next_run_at: new Date(Date.now() + 60_000).toISOString() })
    });
    expect(continuation.status).toBe(409);

    const taskPaused = await request(`/v1/tasks/${task.id}/owner-control`, {
      method: "POST", body: JSON.stringify({ action: "pause" })
    }, ownerToken);
    expect(taskPaused.status).toBe(200);
    const taskResumed = await request(`/v1/tasks/${task.id}/owner-control`, {
      method: "POST", body: JSON.stringify({ action: "resume" })
    }, ownerToken);
    expect(taskResumed.status).toBe(200);
    const queueResumed = await request("/v1/owner/control", {
      method: "POST", body: JSON.stringify({ action: "resume" })
    }, ownerToken);
    expect(queueResumed.status).toBe(200);

    const claimed = await request("/v1/tasks/claim-next", { method: "POST" });
    expect((await claimed.json<{ task: { id: string; status: string; attempt_count: number } }>()).task)
      .toMatchObject({ id: task.id, status: "running", attempt_count: 2 });
    const finish = await request(`/v1/tasks/${task.id}/transition`, {
      method: "POST", body: JSON.stringify({ status: "succeeded", result_summary: "Global pause test completed" })
    });
    expect(finish.status).toBe(200);
  });

  it("recovers an expired running task lease and retries within its attempt budget", async () => {
    const create = await request("/v1/tasks", { method: "POST", body: JSON.stringify({
      idempotency_key: `TASK-LEASE-RECOVERY-${crypto.randomUUID()}`, task_type: "repo_maintenance",
      title: "Lease recovery test", goal: "Verify stale run recovery", approved_scope: "Isolated test only"
    }) });
    const { task } = await create.json<{ task: { id: string } }>();
    await request(`/v1/tasks/${task.id}/approve`, { method: "POST" }, ownerToken);
    const firstClaim = await request("/v1/tasks/claim-next", { method: "POST" });
    expect((await firstClaim.json<{ task: { status: string; attempt_count: number } }>()).task)
      .toMatchObject({ status: "running", attempt_count: 1 });

    const future = Date.now() + 31 * 60 * 1000;
    vi.useFakeTimers();
    try {
      vi.setSystemTime(future);
      const recovered = await request("/v1/tasks/claim-next", { method: "POST" });
      expect((await recovered.json<{ task: { id: string; status: string; attempt_count: number } }>()).task)
        .toMatchObject({ id: task.id, status: "running", attempt_count: 2 });
      const finish = await request(`/v1/tasks/${task.id}/transition`, {
        method: "POST", body: JSON.stringify({ status: "succeeded", result_summary: "Lease recovery verified" })
      });
      expect(finish.status).toBe(200);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not claim a waiting task that has no scheduled continuation", async () => {
    const create = await request("/v1/tasks", { method: "POST", body: JSON.stringify({
      idempotency_key: `TASK-WAITING-BLOCKED-${crypto.randomUUID()}`, task_type: "repo_maintenance",
      title: "Blocked waiting task", goal: "Wait for owner input", approved_scope: "Read-only analysis"
    }) });
    const { task } = await create.json<{ task: { id: string } }>();
    await request(`/v1/tasks/${task.id}/approve`, { method: "POST" }, ownerToken);
    const claimed = await request("/v1/tasks/claim-next", { method: "POST" });
    expect((await claimed.json<{ task: { id: string } }>()).task.id).toBe(task.id);
    const waiting = await request(`/v1/tasks/${task.id}/transition`, {
      method: "POST", body: JSON.stringify({ status: "waiting", checkpoint_summary: "Needs owner input" })
    });
    expect(waiting.status).toBe(200);
    expect(await (await request("/v1/tasks/claim-next", { method: "POST" })).json()).toEqual({ task: null });
  });

  it("persists task checkpoints and terminal outcomes", async () => {
    const create = await request("/v1/tasks", { method: "POST", body: JSON.stringify({
      idempotency_key: `TASK-CHECKPOINT-${crypto.randomUUID()}`, task_type: "repo_maintenance",
      title: "Checkpoint persistence test", goal: "Store and recall progress", approved_scope: "Read-only tests"
    }) });
    const { task } = await create.json<{ task: { id: string } }>();
    await request(`/v1/tasks/${task.id}/approve`, { method: "POST" }, ownerToken);
    const claimed = await request("/v1/tasks/claim-next", { method: "POST" });
    expect((await claimed.json<{ task: { id: string } }>()).task.id).toBe(task.id);
    const waiting = await request(`/v1/tasks/${task.id}/transition`, { method: "POST", body: JSON.stringify({
      status: "waiting", checkpoint_summary: "First test stage complete",
      evidence_refs: ["ci://test/1"], next_run_at: new Date(Date.now() - 1000).toISOString()
    }) });
    expect(waiting.status).toBe(200);
    const resumed = await request("/v1/tasks/claim-next", { method: "POST" });
    expect((await resumed.json<{ task: { status: string; attempt_count: number } }>()).task)
      .toMatchObject({ status: "running", attempt_count: 2 });
    const done = await request(`/v1/tasks/${task.id}/transition`, { method: "POST", body: JSON.stringify({
      status: "succeeded", result_summary: "Read-only test complete"
    }) });
    expect(done.status).toBe(200);
    const read = await request(`/v1/tasks/${task.id}`);
    expect((await read.json<{ task: { status: string; attempt_count: number; checkpoint_summary: string; result_summary: string; evidence_refs: string[] } }>()).task)
      .toMatchObject({ status: "succeeded", attempt_count: 2, checkpoint_summary: "First test stage complete", result_summary: "Read-only test complete", evidence_refs: ["ci://test/1"] });
  });

});
