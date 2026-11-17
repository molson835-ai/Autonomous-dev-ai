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
          GITHUB_CLIENT_ID: "local-vitest-only-client-id",
          GITHUB_CLIENT_SECRET: "local-vitest-only-client-secret",
          OWNER_GITHUB_ID: "341732270",
          CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
          CLOUDFLARE_ANALYTICS_API_TOKEN: "local-vitest-only-analytics-token",
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
