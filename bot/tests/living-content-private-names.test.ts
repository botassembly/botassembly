import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";

const PRIVATE_ECOSYSTEM_NAMES = [
  ["tri", "als[0-9]"].join(""),
  ["nu", "cleus"].join(""),
  ["geno", "moncology"].join(""),
  ["lib", "rarian"].join(""),
  ["var", "classify"].join(""),
  ["pico", "hr"].join(""),
  ["imau", "rer"].join(""),
  ["rolo", "dex"].join(""),
].join("|");

const REPOSITORY_ROOT = new URL("../..", import.meta.url);
const PLANNING_TREE = ["sdlc", "planning"].join("/");

test("living repository content omits private ecosystem names", () => {
  const result = spawnSync(
    "git",
    [
      "grep",
      "-niE",
      PRIVATE_ECOSYSTEM_NAMES,
      "--",
      ":!SECURITY.md",
      ":!scripts/check-public-tree.mjs",
      ":!scripts/check-public-tree.test.mjs",
      ":!sdlc/records",
      ":!sdlc/tickets",
      `:!${PLANNING_TREE}`,
    ],
    { cwd: REPOSITORY_ROOT, encoding: "utf8" },
  );

  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe("");
  expect(result.stdout).toBe("");
  expect(result.status).toBe(1);
});
