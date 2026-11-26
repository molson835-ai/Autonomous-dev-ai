import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../apps/web/app/api/internal/task-wakeup/route.ts", import.meta.url), "utf8");

test("internal wake-up route authenticates, rechecks eligibility, and starts only the idempotent Eve session", () => {
  const productionGuard = route.indexOf('process.env.VERCEL_ENV !== "production"');
  const sharedSecretCheck = route.indexOf("constantTimeEqual(suppliedToken, configuredToken)");
  const statusRecheck = route.indexOf('new URL("/v1/internal/wakeup-status", MEMORY_API)');
  const oidc = route.indexOf("await getVercelOidcToken()");
  const sessionStart = route.indexOf('new URL("/eve/v1/session", request.url)');
  assert.ok(productionGuard >= 0);
  assert.ok(sharedSecretCheck > productionGuard);
  assert.ok(statusRecheck > sharedSecretCheck);
  assert.ok(oidc > statusRecheck);
  assert.ok(sessionStart > oidc);

  assert.match(route, /authorization:\s*"Bearer " \+ configuredToken/);
  assert.match(route, /authorization:\s*"Bearer " \+ oidcToken/);
  assert.match(route, /operationId:\s*value\.operation_id/);
  assert.match(route, /typeof payload\.sessionId === "string"/);
  assert.match(route, /Task claim and completion remain unconfirmed/);
  assert.doesNotMatch(route, /\/v1\/tasks\/[^\n]*\/transition/);
});

test("the wake-up operation identifier is validated against task ID and due timestamp", () => {
  assert.match(route, /value\.operation_id !== `eve-task-\$\{value\.task_id\}-\$\{Date\.parse\(value\.next_run_at\)\}`/);
});
