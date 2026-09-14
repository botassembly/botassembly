import { availableParallelism } from "node:os";
import { defineConfig } from "vitest/config";

// A shared machine: half the cores by default, the whole box when a hosted
// runner sets BOT_TEST_WORKERS (ticket 0287). The suite's wall floor is its
// longest file, so halving the workers costs about twenty seconds and frees
// half the box for a gate running alongside this one.
const workers = Number(process.env["BOT_TEST_WORKERS"] ?? "")
  || Math.max(2, Math.floor(availableParallelism() / 2));

export default defineConfig({
  test: {
    globalSetup: "tests/test-temp-directory-setup.ts",
    testTimeout: 180_000,
    hookTimeout: 180_000,
    maxWorkers: workers,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reportsDirectory: "coverage",
      reporter: ["text-summary", "json-summary"],
      clean: true,
    },
  },
});
