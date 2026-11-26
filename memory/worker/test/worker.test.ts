import { exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

const token = "local-vitest-only-token";
const endpoint = "https://memory-test.invalid";
const ownerToken = "local-vitest-only-owner-token";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function request(path: string, init: RequestInit = {}, credential = token) {
  if (credential === ownerToken) {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/applications/local-owner-oauth-app/token")) {
        return Response.json({ app: { client_id: "local-owner-oauth-app" } });
      }
      return Response.json({ id: 12345678, login: "renamed-owner-login" });
    }));
  } else if (credential === token) {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unauthorized", { status: 401 })));
  }
  if (credential === ownerToken) {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/applications/local-owner-oauth-app/token")) {
        return Response.json({ app: { client_id: "local-owner-oauth-app" } });
      }
      return Response.json({ id: 12345678, login: "renamed-owner-login" });
    }));
  }
  return exports.default.fetch(
    new Request(new URL(path, endpoint), {
      ...init,
      headers: {
        authorization: `Bearer ${credential}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
        "cf-connecting-ip": credential === token ? "203.0.113.2" : "203.0.113.1",
        ...init.headers,
      },
    }),
  );
}

function tavilyCreditRequest(path: "/v1/research/credits/reserve" | "/v1/research/credits/settle", body: Record<string, unknown>) {
  return exports.default.fetch(new Request(new URL(path, endpoint), {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "cf-connecting-ip": "203.0.113.1" },
    body: JSON.stringify(body),
  }));
}

function quotaRequest(reserveNeurons = 200) {
  return exports.default.fetch(new Request(new URL("/v1/quota/reserve", endpoint), {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "cf-connecting-ip": "203.0.113.1" },
    body: JSON.stringify({ reserve_neurons: reserveNeurons, model_id: "@cf/zai-org/glm-4.7-flash" }),
  }));
}
function quotaControlRequest(path: "/v1/quota/settle" | "/v1/quota/circuit" | "/v1/quota/status", body?: Record<string, unknown>) {
  return exports.default.fetch(new Request(new URL(path, endpoint), {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}), "cf-connecting-ip": "203.0.113.1" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }));
}
describe("durable monthly Tavily credit budget", () => {
  it("requires a one-credit reservation and charges reported usage exactly once", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-03T12:00:00.000Z"));
    const invalid = await tavilyCreditRequest("/v1/research/credits/reserve", { credits: 2 });
    expect(invalid.status).toBe(400);
    const reserved = await tavilyCreditRequest("/v1/research/credits/reserve", { credits: 1 });
    expect(reserved.status).toBe(200);
    const { reservation_id } = await reserved.json<{ reservation_id: string; monthly_limit: number }>();
    const settled = await tavilyCreditRequest("/v1/research/credits/settle", { reservation_id, actual_credits: 2 });
    expect(settled.status).toBe(200);
    expect(await settled.json()).toMatchObject({ settled: true, charged_credits: 2, month: "2026-12" });
    expect((await tavilyCreditRequest("/v1/research/credits/settle", { reservation_id, actual_credits: 2 })).status).toBe(404);
  });

  it("blocks reservations at 800 credits and keeps abandoned reservations charged", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-03T12:00:00.000Z"));
    let finalReservation = "";
    for (let i = 0; i < 800; i += 1) {
      const response = await tavilyCreditRequest("/v1/research/credits/reserve", { credits: 1 });
      expect(response.status).toBe(200);
      const body = await response.json<{ reservation_id: string }>();
      finalReservation = body.reservation_id;
    }
    const blocked = await tavilyCreditRequest("/v1/research/credits/reserve", { credits: 1 });
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ reason_code: "tavily_monthly_credit_budget_reached", monthly_limit: 800 });
    vi.setSystemTime(new Date("2027-01-05T13:00:01.000Z"));
    const stillBlocked = await tavilyCreditRequest("/v1/research/credits/reserve", { credits: 1 });
    expect(stillBlocked.status).toBe(429);
    expect(finalReservation).toMatch(/[0-9a-f-]{36}/i);
  });

  it("exposes read-only monthly ledger totals to the verified owner", async () => {
    vi.useFakeTimers();
    // Use a month isolated from the preceding ledger tests, which share the Durable Object.
    vi.setSystemTime(new Date("2030-12-03T12:00:00.000Z"));

    const reserved = await tavilyCreditRequest("/v1/research/credits/reserve", { credits: 1 });
    const { reservation_id } = await reserved.json<{ reservation_id: string }>();
    const pending = await request("/v1/owner/research/credits/status", {}, ownerToken);
    expect(pending.status).toBe(200);
    expect(await pending.json()).toMatchObject({
      month: "2030-12",
      source: "eve_durable_object_ledger_not_provider_account_telemetry",
      monthly_limit: 800,
      used_credits: 0,
      reserved_credits: 1,
      outstanding_reservations: 1,
      remaining_budget: 799,
    });

    const settled = await tavilyCreditRequest("/v1/research/credits/settle", { reservation_id, actual_credits: 1 });
    expect(settled.status).toBe(200);
    const finalStatus = await request("/v1/owner/research/credits/status", {}, ownerToken);
    expect(await finalStatus.json()).toMatchObject({
      used_credits: 1,
      reserved_credits: 0,
      outstanding_reservations: 0,
      remaining_budget: 799,
    });
  });

  it("requires the shared Worker credential for reserve and settlement", async () => {
    const denied = await exports.default.fetch(new Request(new URL("/v1/research/credits/reserve", endpoint), {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ credits: 1 }),
    }));
    expect(denied.status).toBe(401);
  });
});

describe("shared daily neuron quota coordinator", () => {
  it("requires auth and rejects caller-supplied reservation sizes or usage", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-19T12:00:00.000Z"));
    const denied = await exports.default.fetch(new Request(new URL("/v1/quota/reserve", endpoint), {
      method: "POST", body: JSON.stringify({ reserve_neurons: 200, model_id: "@cf/zai-org/glm-4.7-flash" }),
    }));
    expect(denied.status).toBe(401);
    const invalid = await exports.default.fetch(new Request(new URL("/v1/quota/reserve", endpoint), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ reserve_neurons: 1, model_id: "@cf/zai-org/glm-4.7-flash" }),
    }));
    expect(invalid.status).toBe(400);
    expect((await quotaRequest()).status).toBe(200);
  });
  it("keeps the legacy 1200-neuron protocol working during a Worker-first rollout", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T12:00:00.000Z"));
    const reserved = await quotaRequest(1200);
    expect(reserved.status).toBe(200);
    const one = await reserved.json<{ reservation_id: string; reserved_neurons: number }>();
    expect(one.reserved_neurons).toBe(1200);
    const settled = await quotaControlRequest("/v1/quota/settle", { reservation_id: one.reservation_id });
    expect(settled.status).toBe(200);
    expect(await settled.json()).toMatchObject({ settled: true, charged_neurons: 1200 });
  });
  it("charges reported-token neuron estimates instead of the full 200-neuron hold", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-20T12:00:00.000Z"));
    const first = await quotaRequest();
    expect(first.status).toBe(200);
    const one = await first.json<{ reservation_id: string; reserved_neurons: number }>();
    expect(one.reserved_neurons).toBe(200);
    const settled = await quotaControlRequest("/v1/quota/settle", { reservation_id: one.reservation_id, actual_neurons: 12 });
    expect(settled.status).toBe(200);
    expect(await settled.json()).toMatchObject({ settled: true, charged_neurons: 12 });
    expect((await quotaControlRequest("/v1/quota/settle", { reservation_id: one.reservation_id, actual_neurons: 12 })).status).toBe(404);
  });
  it("enforces the 7000-neuron target and returns a machine-readable reason", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-21T12:00:00.000Z"));
    for (let i = 0; i < 6; i += 1) {
      const reserved = await quotaRequest();
      expect(reserved.status).toBe(200);
      const { reservation_id } = await reserved.json<{ reservation_id: string }>();
      expect((await quotaControlRequest("/v1/quota/settle", { reservation_id, actual_neurons: 1200 })).status).toBe(200);
    }
    const blocked = await quotaRequest();
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({
      reason_code: "local_neuron_budget_reached",
      quota: {
        target_neurons: 7000,
        requested_reservation_neurons: 200,
        projected_neurons: 7000,
        remaining_to_target: 0,
      },
    });
    const status = await quotaControlRequest("/v1/quota/status");
    expect(await status.json()).toMatchObject({ model_calls_allowed: false, circuit_open: false });
  });
  it("keeps a failed-provider circuit open and identifies it distinctly", async () => {
    vi.useFakeTimers();
    // Keep this simulated circuit date away from the runner's real UTC date,
    // because the task-claim preflight reads the same daily quota ledger.
    vi.setSystemTime(new Date("2026-11-29T12:00:00.000Z"));
    const reserved = await quotaRequest();
    const { reservation_id } = await reserved.json<{ reservation_id: string }>();
    expect((await quotaControlRequest("/v1/quota/circuit", {
      reservation_id, reason: "cloudflare_daily_quota_exhausted",
    })).status).toBe(200);
    const blocked = await quotaRequest();
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({ reason_code: "quota_circuit_open" });
  });
  it("does not claim approved work when the local neuron target is already reached", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-27T12:00:00.000Z"));
    const create = await request("/v1/tasks", { method: "POST", body: JSON.stringify({
      idempotency_key: `TASK-QUOTA-PREFLIGHT-LOCAL-${crypto.randomUUID()}`,
      task_type: "verification", title: "Quota preflight local-budget test",
      goal: "Verify a blocked model call does not consume an attempt",
      approved_scope: "Isolated regression test only"
    }) });
    const { task } = await create.json<{ task: { id: string } }>();
    await request(`/v1/tasks/${task.id}/approve`, { method: "POST", body: JSON.stringify({ scope_id: "testing" }) }, ownerToken);

    for (let i = 0; i < 5; i += 1) {
      const reservation = await quotaRequest(1200);
      expect(reservation.status).toBe(200);
      const { reservation_id } = await reservation.json<{ reservation_id: string }>();
      expect((await quotaControlRequest("/v1/quota/settle", { reservation_id, actual_neurons: 1200 })).status).toBe(200);
    }
    for (let i = 0; i < 5; i += 1) {
      const reservation = await quotaRequest(200);
      expect(reservation.status).toBe(200);
      const { reservation_id } = await reservation.json<{ reservation_id: string }>();
      expect((await quotaControlRequest("/v1/quota/settle", { reservation_id, actual_neurons: 200 })).status).toBe(200);
    }

    const blocked = await request("/v1/tasks/claim-next", { method: "POST" });
    expect(await blocked.json()).toMatchObject({
      task: null, quota_blocked: true, reason_code: "local_neuron_budget_reached"
    });
    const unchanged = await request(`/v1/tasks/${task.id}`);
    expect((await unchanged.json<{ task: { status: string; attempt_count: number; step_count: number } }>()).task)
      .toMatchObject({ status: "queued", attempt_count: 0 });
    await request(`/v1/tasks/${task.id}/owner-control`, {
      method: "POST", body: JSON.stringify({ action: "pause" })
    }, ownerToken);
  });

  it("does not claim approved work when the provider quota circuit is already open", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-28T12:00:00.000Z"));
    const create = await request("/v1/tasks", { method: "POST", body: JSON.stringify({
      idempotency_key: `TASK-QUOTA-PREFLIGHT-CIRCUIT-${crypto.randomUUID()}`,
      task_type: "verification", title: "Quota preflight circuit test",
      goal: "Verify a provider quota block does not consume an attempt",
      approved_scope: "Isolated regression test only"
    }) });
    const { task } = await create.json<{ task: { id: string } }>();
    await request(`/v1/tasks/${task.id}/approve`, { method: "POST", body: JSON.stringify({ scope_id: "testing" }) }, ownerToken);

    const reservation = await quotaRequest();
    expect(reservation.status).toBe(200);
    const { reservation_id } = await reservation.json<{ reservation_id: string }>();
    expect((await quotaControlRequest("/v1/quota/circuit", {
      reservation_id, reason: "cloudflare_daily_quota_exhausted"
    })).status).toBe(200);

    const blocked = await request("/v1/tasks/claim-next", { method: "POST" });
    expect(await blocked.json()).toMatchObject({
      task: null, quota_blocked: true, reason_code: "quota_circuit_open"
    });
    const unchanged = await request(`/v1/tasks/${task.id}`);
    expect((await unchanged.json<{ task: { status: string; attempt_count: number; step_count: number } }>()).task)
      .toMatchObject({ status: "queued", attempt_count: 0 });
    await request(`/v1/tasks/${task.id}/owner-control`, {
      method: "POST", body: JSON.stringify({ action: "pause" })
    }, ownerToken);
  });

  it("exposes authenticated read-only quota status and labels estimates accurately", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-23T12:00:00.000Z"));
    const reserved = await quotaRequest();
    const { reservation_id } = await reserved.json<{ reservation_id: string }>();
    const status = await quotaControlRequest("/v1/quota/status");
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({
      source: "local_model_estimate_not_provider_telemetry",
      target_neurons: 7000,
      protected_reserve_neurons: 3000,
      active_reserved_neurons: 200,
      model_calls_allowed: true,
    });
    const denied = await exports.default.fetch(new Request(new URL("/v1/quota/status", endpoint)));
    expect(denied.status).toBe(401);
    const ownerDenied = await request("/v1/owner/quota/status");
    expect(ownerDenied.status).toBe(401);
    const ownerStatus = await request("/v1/owner/quota/status", {}, ownerToken);
    expect(ownerStatus.status).toBe(200);
    expect(await ownerStatus.json()).toMatchObject({ source: "local_model_estimate_not_provider_telemetry", target_neurons: 7000 });
    expect((await quotaControlRequest("/v1/quota/settle", { reservation_id, actual_neurons: 0 })).status).toBe(200);
  });
});

describe("owner OAuth app and immutable identity verification", () => {
  it("accepts only a token issued to the configured OAuth app and immutable owner ID", async () => {
    const fakeFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/applications/local-owner-oauth-app/token")) {
        return new Response(JSON.stringify({ app: { client_id: "local-owner-oauth-app" } }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 12345678, login: "renamed-owner-login" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fakeFetch);
    try {
      const response = await request("/v1/owner/status", {}, "oauth-token-issued-to-configured-app");
      expect(response.status).toBe(200);
      expect(fakeFetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects tokens from another OAuth app and accounts with a different immutable ID", async () => {
    const wrongAppFetch = vi.fn(async () =>
      new Response(JSON.stringify({ app: { client_id: "another-oauth-app" } }), { status: 200 })
    );
    vi.stubGlobal("fetch", wrongAppFetch);
    try {
      expect((await request("/v1/owner/status", {}, "oauth-token-from-another-app")).status).toBe(401);
    } finally {
      vi.unstubAllGlobals();
    }

    const wrongOwnerFetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/applications/local-owner-oauth-app/token")) {
        return new Response(JSON.stringify({ app: { client_id: "local-owner-oauth-app" } }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 87654321, login: "same-login-is-not-trusted" }), { status: 200 });
    });
    vi.stubGlobal("fetch", wrongOwnerFetch);
    try {
      expect((await request("/v1/owner/status", {}, "oauth-token-for-wrong-account")).status).toBe(401);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("durable task wake-up eligibility", () => {
  it("exposes only a token-protected eligibility check for a due approved checkpoint", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2041-06-12T12:00:00.000Z"));
    const created = await request("/v1/tasks", {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: `TASK-WAKEUP-${crypto.randomUUID()}`,
        task_type: "verification",
        title: "Wake-up eligibility test",
        goal: "Verify a due approved checkpoint can be woken",
        approved_scope: "Isolated regression test only",
      }),
    });
    expect(created.status).toBe(201);
    const { task } = await created.json<{ task: { id: string } }>();
    expect((await request(`/v1/tasks/${task.id}/approve`, {
      method: "POST", body: JSON.stringify({ scope_id: "testing" }),
    }, ownerToken)).status).toBe(200);
    const claimed = await request("/v1/tasks/claim-next", { method: "POST" });
    expect(claimed.status).toBe(200);
    const dueAt = new Date(Date.now() - 1000).toISOString();
    const transitioned = await request(`/v1/tasks/${task.id}/transition`, {
      method: "POST",
      body: JSON.stringify({ status: "waiting", checkpoint_summary: "Verified test checkpoint", next_run_at: dueAt }),
    });
    expect(transitioned.status).toBe(200);

    const denied = await exports.default.fetch(new Request(new URL(
      `/v1/internal/wakeup-status?task_id=${task.id}&next_run_at=${encodeURIComponent(dueAt)}`, endpoint,
    )));
    expect(denied.status).toBe(401);

    const eligible = await request(
      `/v1/internal/wakeup-status?task_id=${task.id}&next_run_at=${encodeURIComponent(dueAt)}`,
    );
    expect(eligible.status).toBe(200);
    expect(await eligible.json()).toMatchObject({ eligible: true, queue_paused: false, running_tasks: 0 });

    expect((await request("/v1/owner/control", {
      method: "POST", body: JSON.stringify({ action: "pause", reason: "test cleanup" }),
    }, ownerToken)).status).toBe(200);
    const paused = await request(
      `/v1/internal/wakeup-status?task_id=${task.id}&next_run_at=${encodeURIComponent(dueAt)}`,
    );
    expect(await paused.json()).toMatchObject({ eligible: false, queue_paused: true });
    await request("/v1/owner/control", { method: "POST", body: JSON.stringify({ action: "resume" }) }, ownerToken);
    await request(`/v1/tasks/${task.id}/owner-control`, {
      method: "POST", body: JSON.stringify({ action: "pause" }),
    }, ownerToken);
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
    const ownerTasks = await request("/v1/owner/tasks?limit=5", {}, ownerToken);
    expect(ownerTasks.status).toBe(200);
    expect(Array.isArray((await ownerTasks.json<{ tasks: unknown[] }>()).tasks)).toBe(true);

    const proposedTask = await request("/v1/owner/tasks", {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: `OWNER-CONSOLE-PROPOSAL-${crypto.randomUUID()}`,
        task_type: "verification",
        title: "Owner-authenticated proposal test",
        goal: "Verify that owner task proposals remain unapproved.",
        approved_scope: "Read-only test scope; no external side effects."
      })
    }, ownerToken);
    expect(proposedTask.status).toBe(201);
    const proposal = await proposedTask.json<{ task: { status: string; owner_approved: boolean; mission_authorized: boolean }; created: boolean }>();
    expect(proposal.created).toBe(true);
    expect(proposal.task).toMatchObject({ status: "proposed", owner_approved: false, mission_authorized: false });

    const nonOwnerProposal = await request("/v1/owner/tasks", {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: `NONOWNER-PROPOSAL-${crypto.randomUUID()}`,
        task_type: "verification",
        title: "Must be rejected",
        goal: "Non-owner cannot create tasks.",
        approved_scope: "Test only."
      })
    });
    expect(nonOwnerProposal.status).toBe(401);

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

  it("never lets an agent-supplied scope authorize or auto-queue a task", async () => {
    const payload = {
      idempotency_key: `MISSION-ATTEMPT-${crypto.randomUUID()}`,
      task_type: "market_research",
      title: "Research public market information",
      goal: "Compare public market information",
      approved_scope: "Read public sources only; no external side effects."
    };
    const created = await request("/v1/tasks", { method: "POST", body: JSON.stringify(payload) });
    expect(created.status).toBe(201);
    const result = await created.json<{ task: { status: string; owner_approved: boolean; mission_authorized: boolean; scope_id: string }; mission_authorized: boolean }>();
    expect(result.mission_authorized).toBe(false);
    expect(result.task).toMatchObject({ status: "proposed", owner_approved: false, mission_authorized: false, scope_id: "owner_review_required" });

    const forgedScope = await request("/v1/tasks", { method: "POST", body: JSON.stringify({
      ...payload,
      idempotency_key: `MISSION-FORGED-${crypto.randomUUID()}`,
      scope_id: "public_web_research_no_contact"
    }) });
    expect(forgedScope.status).toBe(400);
    const claim = await request("/v1/tasks/claim-next", { method: "POST" });
    expect(await claim.json()).toEqual({ task: null });
  });

  it("rejects unapproved scope identifiers and keeps tasks proposed", async () => {
    const create = await request("/v1/tasks", { method: "POST", body: JSON.stringify({
      idempotency_key: `TASK-INVALID-SCOPE-${crypto.randomUUID()}`, task_type: "repo_maintenance",
      title: "Invalid owner scope test", goal: "Reject an unknown scope", approved_scope: "Test only"
    }) });
    const { task } = await create.json<{ task: { id: string; scope_id: string } }>();
    const denied = await request(`/v1/tasks/${task.id}/approve`, {
      method: "POST", body: JSON.stringify({ scope_id: "customer_outreach" })
    }, ownerToken);
    expect(denied.status).toBe(400);
    const unchanged = await request(`/v1/tasks/${task.id}`);
    expect((await unchanged.json<{ task: { status: string; owner_approved: boolean; scope_id: string } }>()).task)
      .toMatchObject({ status: "proposed", owner_approved: false, scope_id: "owner_review_required" });
  });

  it("requires the separate owner credential to approve and claims only approved tasks", async () => {
    const create = await request("/v1/tasks", { method: "POST", body: JSON.stringify({
      idempotency_key: `TASK-APPROVAL-${crypto.randomUUID()}`, task_type: "repo_maintenance",
      title: "Approved task test", goal: "Run a bounded read-only check", approved_scope: "Read-only tests only"
    }) });
    expect(create.status).toBe(201);
    const { task } = await create.json<{ task: { id: string } }>();
    const denied = await request(`/v1/tasks/${task.id}/approve`, { method: "POST" });
    expect(denied.status).toBe(401);
    const approved = await request(`/v1/tasks/${task.id}/approve`, {
      method: "POST", body: JSON.stringify({ scope_id: "testing" })
    }, ownerToken);
    expect(approved.status).toBe(200);
    expect((await approved.json<{ task: { status: string; owner_approved: boolean; scope_id: string } }>()).task)
      .toMatchObject({ status: "queued", owner_approved: true, scope_id: "testing" });
    const claimed = await request("/v1/tasks/claim-next", { method: "POST" });
    expect((await claimed.json<{ task: { id: string; status: string; attempt_count: number; step_count: number } }>()).task)
      .toMatchObject({ id: task.id, status: "running", attempt_count: 0, step_count: 1 });
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
    expect((await reclaimed.json<{ task: { status: string; attempt_count: number; step_count: number } }>()).task)
      .toMatchObject({ status: "running", attempt_count: 0, step_count: 2 });
    const missingEvidence = await request(`/v1/tasks/${task.id}/transition`, {
      method: "POST", body: JSON.stringify({ status: "succeeded", result_summary: "Approval test completed" })
    });
    expect(missingEvidence.status).toBe(409);
    const stillRunning = await request(`/v1/tasks/${task.id}`);
    expect((await stillRunning.json<{ task: { status: string } }>()).task.status).toBe("running");
    const finish = await request(`/v1/tasks/${task.id}/transition`, {
      method: "POST", body: JSON.stringify({ status: "succeeded", result_summary: "Approval test completed", evidence_refs: ["test://approval-closeout"] })
    });
    expect(finish.status).toBe(200);
  });

  it("refreshes only an actively running owner-approved task lease", async () => {
    const create = await request("/v1/tasks", { method: "POST", body: JSON.stringify({
      idempotency_key: `TASK-HEARTBEAT-${crypto.randomUUID()}`, task_type: "repo_maintenance",
      title: "Heartbeat test", goal: "Verify active lease refresh", approved_scope: "Test only"
    }) });
    const { task } = await create.json<{ task: { id: string } }>();
    await request(`/v1/tasks/${task.id}/approve`, { method: "POST" }, ownerToken);
    const claimed = await request("/v1/tasks/claim-next", { method: "POST" });
    expect((await claimed.json<{ task: { id: string; owner_approved: boolean; mission_authorized: boolean } }>()).task)
      .toMatchObject({ id: task.id, owner_approved: true, mission_authorized: false });

    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 25 * 60 * 1000);
      const heartbeat = await request(`/v1/tasks/${task.id}/heartbeat`, { method: "POST", body: "{}" });
      expect(heartbeat.status).toBe(200);
      expect(await heartbeat.json()).toMatchObject({ heartbeat: true });
      vi.setSystemTime(Date.now() + 10 * 60 * 1000);
      expect(await (await request("/v1/tasks/claim-next", { method: "POST" })).json()).toEqual({ task: null });
      vi.setSystemTime(Date.now() + 21 * 60 * 1000);
      const recovered = await request("/v1/tasks/claim-next", { method: "POST" });
      expect((await recovered.json<{ task: { id: string; status: string; attempt_count: number; step_count: number } }>()).task)
        .toMatchObject({ id: task.id, status: "running", attempt_count: 1, step_count: 2 });
      const terminal = await request(`/v1/tasks/${task.id}/transition`, {
        method: "POST", body: JSON.stringify({ status: "succeeded", result_summary: "Heartbeat recovery test complete", evidence_refs: ["test://heartbeat-recovery"] })
      });
      expect(terminal.status).toBe(200);
      expect((await request(`/v1/tasks/${task.id}/heartbeat`, { method: "POST", body: "{}" })).status).toBe(409);
    } finally {
      vi.useRealTimers();
    }
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
    expect((await firstClaim.json<{ task: { id: string; status: string; attempt_count: number; step_count: number } }>()).task)
      .toMatchObject({ id: task.id, status: "running", attempt_count: 0, step_count: 1 });

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
    expect((await claimed.json<{ task: { id: string; status: string; attempt_count: number; step_count: number } }>()).task)
      .toMatchObject({ id: task.id, status: "running", attempt_count: 0, step_count: 2 });
    const finish = await request(`/v1/tasks/${task.id}/transition`, {
      method: "POST", body: JSON.stringify({ status: "succeeded", result_summary: "Global pause test completed", evidence_refs: ["test://global-pause"] })
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
    expect((await firstClaim.json<{ task: { status: string; attempt_count: number; step_count: number } }>()).task)
      .toMatchObject({ status: "running", attempt_count: 0, step_count: 1 });

    const future = Date.now() + 31 * 60 * 1000;
    vi.useFakeTimers();
    try {
      vi.setSystemTime(future);
      const recovered = await request("/v1/tasks/claim-next", { method: "POST" });
      expect((await recovered.json<{ task: { id: string; status: string; attempt_count: number; step_count: number } }>()).task)
        .toMatchObject({ id: task.id, status: "running", attempt_count: 1, step_count: 2 });
      const finish = await request(`/v1/tasks/${task.id}/transition`, {
        method: "POST", body: JSON.stringify({ status: "succeeded", result_summary: "Lease recovery verified", evidence_refs: ["test://lease-recovery"] })
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
    expect((await resumed.json<{ task: { status: string; attempt_count: number; step_count: number } }>()).task)
      .toMatchObject({ status: "running", attempt_count: 0, step_count: 2 });
    const done = await request(`/v1/tasks/${task.id}/transition`, { method: "POST", body: JSON.stringify({
      status: "succeeded", result_summary: "Read-only test complete", evidence_refs: ["ci://test/1"]
    }) });
    expect(done.status).toBe(200);
    const read = await request(`/v1/tasks/${task.id}`);
    expect((await read.json<{ task: { status: string; attempt_count: number; step_count: number; checkpoint_summary: string; result_summary: string; evidence_refs: string[] } }>()).task)
      .toMatchObject({ status: "succeeded", attempt_count: 0, step_count: 2, checkpoint_summary: "First test stage complete", result_summary: "Read-only test complete", evidence_refs: ["ci://test/1"] });
  });


  it("rejects premature success without completion evidence and preserves the running task", async () => {
    const create = await request("/v1/tasks", { method: "POST", body: JSON.stringify({
      idempotency_key: `TASK-PREMATURE-SUCCESS-${crypto.randomUUID()}`,
      task_type: "verification", title: "Premature completion guard",
      goal: "Verify all approved objectives before success",
      approved_scope: "Isolated Worker integration test only"
    }) });
    expect(create.status).toBe(201);
    const { task } = await create.json<{ task: { id: string } }>();
    expect((await request(`/v1/tasks/${task.id}/approve`, { method: "POST" }, ownerToken)).status).toBe(200);
    expect((await request("/v1/tasks/claim-next", { method: "POST" })).status).toBe(200);

    const premature = await request(`/v1/tasks/${task.id}/transition`, {
      method: "POST",
      body: JSON.stringify({ status: "succeeded", result_summary: "One research step completed" })
    });
    expect(premature.status).toBe(409);
    expect(await premature.json()).toMatchObject({ reason_code: "completion_evidence_required" });

    const current = await request(`/v1/tasks/${task.id}`);
    expect((await current.json<{ task: { status: string; result_summary: string | null } }>()).task)
      .toMatchObject({ status: "running", result_summary: null });

    const checkpoint = await request(`/v1/tasks/${task.id}/transition`, {
      method: "POST",
      body: JSON.stringify({ status: "waiting", checkpoint_summary: "One bounded step completed; remaining objectives require another step." })
    });
    expect(checkpoint.status).toBe(200);
    expect((await checkpoint.json<{ task: { status: string } }>()).task.status).toBe("waiting");
  });

  it("serializes concurrent claims so only one approved task can run", async () => {
    const tasks = [];
    for (const suffix of ["A", "B"]) {
      const created = await request("/v1/tasks", { method: "POST", body: JSON.stringify({
        idempotency_key: `TASK-CONCURRENT-CLAIM-${suffix}-${crypto.randomUUID()}`,
        task_type: "verification",
        title: `Concurrent claim candidate ${suffix}`,
        goal: "Verify only one task is claimed across overlapping requests",
        approved_scope: "Isolated integration test only"
      }) });
      expect(created.status).toBe(201);
      const { task } = await created.json<{ task: { id: string } }>();
      tasks.push(task);
      const approved = await request(`/v1/tasks/${task.id}/approve`, {
        method: "POST", body: JSON.stringify({ scope_id: "testing" })
      }, ownerToken);
      expect(approved.status).toBe(200);
    }

    const claims = await Promise.all([
      request("/v1/tasks/claim-next", { method: "POST" }),
      request("/v1/tasks/claim-next", { method: "POST" })
    ]);
    const results = await Promise.all(claims.map(response => response.json<{ task: { id: string } | null }>()));
    expect(results.filter(result => result.task !== null)).toHaveLength(1);

    const records = await Promise.all(tasks.map(async task => {
      const response = await request(`/v1/tasks/${task.id}`);
      return (await response.json<{ task: { id: string; status: string; step_count: number } }>()).task;
    }));
    expect(records.filter(task => task.status === "running")).toHaveLength(1);
    expect(records.filter(task => task.status === "queued")).toHaveLength(1);
    expect(records.filter(task => task.step_count === 1)).toHaveLength(1);

    const running = records.find(task => task.status === "running");
    expect(running).toBeDefined();
    await request(`/v1/tasks/${running!.id}/owner-control`, {
      method: "POST", body: JSON.stringify({ action: "pause" })
    }, ownerToken);
    const queued = records.find(task => task.status === "queued");
    expect(queued).toBeDefined();
    await request(`/v1/tasks/${queued!.id}/owner-control`, {
      method: "POST", body: JSON.stringify({ action: "pause" })
    }, ownerToken);
  });

});


describe("persistent quarantined resource catalog and owner review", () => {
  it("stores only allowlisted metadata in quarantine and makes duplicate submissions idempotent", async () => {
    const candidate = {
      id: `test.resource.${crypto.randomUUID()}`,
      name: "Test resource",
      summary: "Metadata-only resource intake integration test.",
      resource_type: "documentation",
      skill_tags: ["testing"],
      source_url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
      maintainer: "unknown",
      license: "unknown",
      version_or_revision: "unknown",
      cost_model: "unknown",
      dependencies: [],
      permissions: [],
      network_or_execution_requirements: ["HTTPS read only"],
      security_notes: "Not executed; awaiting owner review."
    };
    const created = await request("/v1/resources", { method: "POST", body: JSON.stringify(candidate) });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ id: candidate.id, trust_state: "quarantined", created: true });
    const duplicate = await request("/v1/resources", { method: "POST", body: JSON.stringify(candidate) });
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toMatchObject({ id: candidate.id, trust_state: "quarantined", created: false });

    const ownerDenied = await request("/v1/owner/resources");
    expect(ownerDenied.status).toBe(401);
    const listed = await request("/v1/owner/resources?limit=50", {}, ownerToken);
    expect(listed.status).toBe(200);
    const resources = await listed.json<{ resources: Array<{ id: string; trust_state: string; resource: { name: string } }> }>();
    expect(resources.resources).toContainEqual(expect.objectContaining({
      id: candidate.id, trust_state: "quarantined",
      resource: expect.objectContaining({ name: candidate.name, trust_state: "quarantined" })
    }));
  });

  it("requires owner authentication and evidence for every resource decision", async () => {
    const id = `review.resource.${crypto.randomUUID()}`;
    const candidate = {
      id, name: "Review test", summary: "Owner decision boundary test.",
      resource_type: "documentation", source_url: "https://owasp.org/www-project-top-ten/",
      skill_tags: [], dependencies: [], permissions: [],
      network_or_execution_requirements: ["HTTPS read only"]
    };
    expect((await request("/v1/resources", { method: "POST", body: JSON.stringify(candidate) })).status).toBe(201);
    const path = `/v1/owner/resources/${id}/decision`;
    expect((await request(path, { method: "POST", body: JSON.stringify({ decision: "approve", review_evidence: ["Reviewed"] }) })).status).toBe(401);
    expect((await request(path, { method: "POST", body: JSON.stringify({ decision: "approve" }) }, ownerToken)).status).toBe(400);
    const approved = await request(path, {
      method: "POST",
      body: JSON.stringify({ decision: "approve", review_evidence: ["Owner inspected provenance, license, permissions, and cost metadata."] })
    }, ownerToken);
    expect(approved.status).toBe(200);
    expect(await approved.json()).toMatchObject({ id, trust_state: "approved", reviewer: "owner" });
    expect((await request(path, {
      method: "POST",
      body: JSON.stringify({ decision: "reject", review_evidence: ["Conflicting decision must not overwrite approval."] })
    }, ownerToken)).status).toBe(409);
    const listed = await request("/v1/owner/resources?limit=50", {}, ownerToken);
    const resources = await listed.json<{ resources: Array<{ id: string; trust_state: string; review_evidence: string[] }> }>();
    expect(resources.resources.find(item => item.id === id)).toMatchObject({
      trust_state: "approved",
      review_evidence: ["Owner inspected provenance, license, permissions, and cost metadata."]
    });
  });

  it("rejects malformed or unapproved resource source hosts without storing them", async () => {
    const id = `unsafe.resource.${crypto.randomUUID()}`;
    const bad = await request("/v1/resources", {
      method: "POST",
      body: JSON.stringify({ id, name: "Unsafe", summary: "Must be rejected", resource_type: "tool", source_url: "https://evil.example/tool" })
    });
    expect(bad.status).toBe(400);
    const listed = await request("/v1/owner/resources?limit=50", {}, ownerToken);
    const resources = await listed.json<{ resources: Array<{ id: string }> }>();
    expect(resources.resources.some(item => item.id === id)).toBe(false);
  });

  it("allows five checkpointed phases while keeping stale-run retries at zero", async () => {
    const create = await request("/v1/tasks", { method: "POST", body: JSON.stringify({
      idempotency_key: `TASK-MULTI-STEP-${crypto.randomUUID()}`, task_type: "testing",
      title: "Multi-step continuation test", goal: "Verify ten-step progress budget", approved_scope: "Isolated test only"
    }) });
    const { task } = await create.json<{ task: { id: string } }>();
    await request(`/v1/tasks/${task.id}/approve`, { method: "POST" }, ownerToken);
    for (let step = 1; step <= 10; step += 1) {
      const claimed = await request("/v1/tasks/claim-next", { method: "POST" });
      expect((await claimed.json<{ task: { status: string; step_count: number; attempt_count: number } }>()).task)
        .toMatchObject({ status: "running", step_count: step, attempt_count: 0 });
      const waiting = await request(`/v1/tasks/${task.id}/transition`, { method: "POST", body: JSON.stringify({
        status: "waiting", checkpoint_summary: `Completed phase ${step}`, next_run_at: new Date(Date.now() - 1000).toISOString()
      }) });
      expect(waiting.status).toBe(200);
      if (step === 10) expect((await waiting.json<{ task: { status: string } }>()).task.status).toBe("paused");
    }
    const record = await request(`/v1/tasks/${task.id}`);
    expect((await record.json<{ task: { status: string; step_count: number; attempt_count: number; max_steps: number } }>()).task)
      .toMatchObject({ status: "paused", step_count: 10, attempt_count: 0, max_steps: 10 });
  });
});
