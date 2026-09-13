import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: "tests/test-temp-directory-setup.ts",
    testTimeout: 180_000,
    hookTimeout: 180_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reportsDirectory: "coverage",
      reporter: ["text-summary", "json-summary"],
      clean: true,
    },
  },
});
