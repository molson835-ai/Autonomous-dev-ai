import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

const token = "local-vitest-only-token";
const ownerToken = "local-vitest-only-owner-token";
const endpoint = "https://memory-test.invalid";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function request(path: string, init: RequestInit = {}, credential = token) {
  if (credential === ownerToken) {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/applications/local-owner-oauth-app/token")) {
        return Response.json({ app: { client_id: "local-owner-oauth-app" } });
      }
      return Response.json({ id: 12345678, login: "renamed-owner-login" });
    }));
  }
  return exports.default.fetch(new Request(new URL(path, endpoint), {
    ...init,
    headers: {
      authorization: `Bearer ${credential}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      "cf-connecting-ip": credential === ownerToken ? "203.0.113.1" : "203.0.113.2",
      ...init.headers,
    },
  }));
}

describe("Durable Object task wake-up alarm", () => {
  it("dispatches one authenticated Eve session for the exact due checkpoint operation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2042-07-18T12:00:00.000Z"));

    const created = await request("/v1/tasks", {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: `TASK-ALARM-${crypto.randomUUID()}`,
        task_type: "verification",
        title: "Alarm dispatch integration test",
        goal: "Verify the Durable Object alarm dispatches the exact approved waiting task",
        approved_scope: "Isolated test only; no external side effects",
      }),
    });
    expect(created.status).toBe(201);
    const { task } = await created.json<{ task: { id: string } }>();

    const approved = await request(`/v1/tasks/${task.id}/approve`, {
      method: "POST",
      body: JSON.stringify({ scope_id: "testing" }),
    }, ownerToken);
    expect(approved.status).toBe(200);

    const claimed = await request("/v1/tasks/claim-next", { method: "POST" });
    expect(claimed.status).toBe(200);
    expect((await claimed.json()).task.id).toBe(task.id);

    const dueAt = new Date(Date.now() - 1000).toISOString();
    const checkpoint = await request(`/v1/tasks/${task.id}/transition`, {
      method: "POST",
      body: JSON.stringify({
        status: "waiting",
        checkpoint_summary: "Alarm dispatch integration checkpoint",
        next_run_at: dueAt,
      }),
    });
    expect(checkpoint.status).toBe(200);

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://autonomous-dev-ai.vercel.app/api/internal/task-wakeup");
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${token}`);
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({
        task_id: task.id,
        next_run_at: dueAt,
        operation_id: `eve-task-${task.id}-${Date.parse(dueAt)}`,
      });
      return Response.json({ accepted: true, session_id: "wrun_test" }, { status: 202 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const stub = env.MEMORY.get(env.MEMORY.idFromName("single-owner-memory"));
    const fired = await runDurableObjectAlarm(stub);
    expect(fired).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Simulate Cloudflare retrying an alarm after an ambiguous network failure.
    // The durable attempt ledger must prevent a second Eve session dispatch.
    await runInDurableObject(stub, async (_instance, state) => {
      await state.storage.setAlarm(Date.now() + 1000);
    });
    const retried = await runDurableObjectAlarm(stub);
    expect(retried).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const stillWaiting = await request(`/v1/tasks/${task.id}`);
    expect((await stillWaiting.json<{ task: { status: string; owner_approved: boolean } }>()).task)
      .toMatchObject({ status: "waiting", owner_approved: true });

    const paused = await request(`/v1/tasks/${task.id}/transition`, {
      method: "POST",
      body: JSON.stringify({ status: "paused", checkpoint_summary: "Test cleanup" }),
    });
    expect(paused.status).toBe(200);
  });
});
