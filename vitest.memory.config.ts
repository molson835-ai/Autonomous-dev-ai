import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: "./memory/worker/wrangler.jsonc",
      },
      miniflare: {
        // Test-only credential. Never read or reuse a deployed Worker secret.
        bindings: {
          MEMORY_API_TOKEN: "local-vitest-only-token",
          CLOUDFLARE_ACCOUNT_ID: "local-cloudflare-account-id",
          CLOUDFLARE_ANALYTICS_API_TOKEN: "local-cloudflare-analytics-token",
          OWNER_GITHUB_ID: "341732270",
          OWNER_SESSION_SIGNING_SECRET: "local-owner-session-signing-secret-for-tests-only",
        },
      },
    }),
  ],
  test: {
    include: ["memory/worker/test/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
