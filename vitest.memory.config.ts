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
          CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
          CLOUDFLARE_ANALYTICS_API_TOKEN: "local-vitest-only-analytics-token",
          TASK_OWNER_APPROVAL_TOKEN: "local-vitest-only-owner-token",
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
