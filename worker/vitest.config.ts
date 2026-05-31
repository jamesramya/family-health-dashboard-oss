import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    hookTimeout: 30000,
    testTimeout: 30000,
    retry: 2,
    include: ["test/**/*.test.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          d1Databases: ["DB"],
          r2Buckets: ["BUCKET"],
          bindings: { ANTHROPIC_API_KEY: "test-key", ENVIRONMENT: "test" },
        },
      },
    },
  },
});
