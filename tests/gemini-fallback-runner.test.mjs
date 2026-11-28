import assert from "node:assert/strict";
import test from "node:test";
import { reserveOrRunWithGeminiFallback } from "../agent/lib/gemini-fallback-runner.mjs";

const localBudgetError = () => Object.assign(new Error("local budget reached"), {
  name: "EVEQuotaReservationError",
  reason_code: "local_neuron_budget_reached",
});

test("generate uses Gemini once only after the exact local safety-target reservation error", async () => {
  let primaryReservations = 0;
  let geminiCalls = 0;
  let fallbackLogs = 0;
  const result = { text: "fallback result", usage: {} };
  const decision = await reserveOrRunWithGeminiFallback({
    reserve: async () => {
      primaryReservations++;
      throw localBudgetError();
    },
    fallbackModel: {
      doGenerate: async () => { geminiCalls++; return result; },
      doStream: async () => { throw new Error("unexpected stream call"); },
    },
    params: {},
    mode: "generate",
    onFallback: () => { fallbackLogs++; },
  });

  assert.equal(primaryReservations, 1);
  assert.equal(geminiCalls, 1);
  assert.equal(fallbackLogs, 1);
  assert.deepEqual(decision, { kind: "fallback", result });
});

test("stream uses Gemini once only after the exact local safety-target reservation error", async () => {
  let geminiCalls = 0;
  const result = { stream: new ReadableStream() };
  const decision = await reserveOrRunWithGeminiFallback({
    reserve: async () => { throw localBudgetError(); },
    fallbackModel: {
      doGenerate: async () => { throw new Error("unexpected generate call"); },
      doStream: async () => { geminiCalls++; return result; },
    },
    params: {},
    mode: "stream",
  });

  assert.equal(geminiCalls, 1);
  assert.deepEqual(decision, { kind: "fallback", result });
});

test("successful Cloudflare reservation always remains primary", async () => {
  let geminiCalls = 0;
  const decision = await reserveOrRunWithGeminiFallback({
    reserve: async () => "reservation-123",
    fallbackModel: {
      doGenerate: async () => { geminiCalls++; return {}; },
      doStream: async () => { geminiCalls++; return {}; },
    },
    params: {},
    mode: "generate",
  });

  assert.deepEqual(decision, { kind: "primary", reservationId: "reservation-123" });
  assert.equal(geminiCalls, 0);
});

test("provider quota, telemetry, unknown, and non-reservation errors never invoke Gemini", async () => {
  const errors = [
    Object.assign(new Error("provider quota"), { name: "EVEQuotaReservationError", reason_code: "quota_circuit_open" }),
    Object.assign(new Error("telemetry unavailable"), { name: "EVEQuotaReservationError", reason_code: "quota_telemetry_unavailable" }),
    Object.assign(new Error("unknown"), { name: "EVEQuotaReservationError", reason_code: "unclassified" }),
    Object.assign(new Error("wrong category"), { name: "EVEQuotaGuardError", reason_code: "local_neuron_budget_reached" }),
    new Error("ordinary reservation failure"),
  ];

  for (const error of errors) {
    let geminiCalls = 0;
    await assert.rejects(
      reserveOrRunWithGeminiFallback({
        reserve: async () => { throw error; },
        fallbackModel: {
          doGenerate: async () => { geminiCalls++; return {}; },
          doStream: async () => { geminiCalls++; return {}; },
        },
        params: {},
        mode: "generate",
      }),
      thrown => thrown === error,
    );
    assert.equal(geminiCalls, 0);
  }
});

test("Gemini failure is wrapped as a non-retryable plain error and is not retried", async () => {
  const providerError = Object.assign(new Error("429 rate limit"), { status: 429 });
  let geminiCalls = 0;

  await assert.rejects(
    reserveOrRunWithGeminiFallback({
      reserve: async () => { throw localBudgetError(); },
      fallbackModel: {
        doGenerate: async () => { geminiCalls++; throw providerError; },
        doStream: async () => { geminiCalls++; throw providerError; },
      },
      params: {},
      mode: "generate",
    }),
    error => error.name === "EVEGeminiFallbackError"
      && error.constructor === Error
      && error.cause === providerError,
  );

  assert.equal(geminiCalls, 1);
});

test("missing Gemini model leaves local safety-target errors fail-closed", async () => {
  const error = localBudgetError();
  await assert.rejects(
    reserveOrRunWithGeminiFallback({
      reserve: async () => { throw error; },
      params: {},
      mode: "generate",
    }),
    thrown => thrown === error,
  );
});
