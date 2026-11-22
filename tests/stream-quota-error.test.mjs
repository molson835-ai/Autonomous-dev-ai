import test from "node:test";
import assert from "node:assert/strict";
import { handleStreamReadFailure } from "../agent/lib/stream-quota-error.mjs";

function harness({ quota = false, circuitFails = false, settleFails = false } = {}) {
  const calls = [];
  const original = Object.assign(new Error("provider stream failed"), { code: quota ? 4006 : "ECONNRESET" });
  const wrapped = Object.assign(new Error("EVE stopped this model request because the Cloudflare daily neuron allocation is exhausted."), {
    name: "EVEQuotaExhaustedError", cause: original,
  });
  const options = {
    error: original,
    reservationId: "reservation-123",
    settle: async (id) => { calls.push(["settle", id]); if (settleFails) throw new Error("settlement unavailable"); },
    circuit: async (id) => { calls.push(["circuit", id]); if (circuitFails) throw new Error("circuit unavailable"); },
    isQuotaError: (error) => error?.code === 4006,
    nonRetryableQuotaError: (error) => { assert.equal(error, original); return wrapped; },
  };
  return { calls, original, wrapped, options };
}

test("a quota rejection arriving during stream reading opens the circuit and retains its reservation", async () => {
  const h = harness({ quota: true });
  await assert.rejects(handleStreamReadFailure(h.options), (error) => error === h.wrapped);
  assert.deepEqual(h.calls, [["circuit", "reservation-123"]]);
});

test("a quota rejection remains non-retryable even if circuit persistence fails", async () => {
  const h = harness({ quota: true, circuitFails: true });
  await assert.rejects(handleStreamReadFailure(h.options), (error) => error === h.wrapped);
  assert.deepEqual(h.calls, [["circuit", "reservation-123"]]);
});

test("a non-quota stream failure settles conservatively and preserves the original error", async () => {
  const h = harness();
  await assert.rejects(handleStreamReadFailure(h.options), (error) => error === h.original);
  assert.deepEqual(h.calls, [["settle", "reservation-123"]]);
});

test("a non-quota stream failure is preserved even if conservative settlement fails", async () => {
  const h = harness({ settleFails: true });
  await assert.rejects(handleStreamReadFailure(h.options), (error) => error === h.original);
  assert.deepEqual(h.calls, [["settle", "reservation-123"]]);
});
