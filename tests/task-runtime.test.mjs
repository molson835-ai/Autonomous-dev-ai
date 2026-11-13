import test from "node:test";
import assert from "node:assert/strict";
import { assertProductionTaskRuntime, isProductionTaskRuntime } from "../agent/lib/task-runtime.mjs";

test("only Vercel Production can read or mutate the durable task queue", () => {
  assert.equal(isProductionTaskRuntime({ VERCEL_ENV: "production" }), true);
  assert.equal(isProductionTaskRuntime({ VERCEL_ENV: "preview" }), false);
  assert.equal(isProductionTaskRuntime({ VERCEL_ENV: "development" }), false);
  assert.equal(isProductionTaskRuntime({}), false);
  assert.doesNotThrow(() => assertProductionTaskRuntime({ VERCEL_ENV: "production" }));
  assert.throws(() => assertProductionTaskRuntime({ VERCEL_ENV: "preview" }), /disabled outside Vercel Production/);
  assert.throws(() => assertProductionTaskRuntime({}), /disabled outside Vercel Production/);
});
