export function isProductionTaskRuntime(env = process.env) {
  return env?.VERCEL_ENV === "production";
}

export function assertProductionTaskRuntime(env = process.env) {
  if (!isProductionTaskRuntime(env)) {
    throw new Error("Durable task queue operations are disabled outside Vercel Production.");
  }
}
