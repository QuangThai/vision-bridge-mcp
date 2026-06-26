import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/e2e/**/*.test.ts"],
    exclude: [],
    environment: "node",
    testTimeout: 120_000,
  },
});
