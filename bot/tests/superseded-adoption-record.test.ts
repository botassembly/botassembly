import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const COMPLETION_RECORD = new URL("../../sdlc/records/0197-adopt-3e66f4eaf7a538775567.md", import.meta.url);
const SUPERSEDING_ADOPTION_IDENTITY =
  "sdlc/tickets/0242-gate-verdict-keeps-the-failing-names.md@01e3c582af7d85fb0547a08d049e02e3763d7349";
const GREEN_MAIN_COMPLETION_RECORD = new URL(
  "../../sdlc/records/0199-adopt-af14ff4dbb7aba6d34b7.md",
  import.meta.url,
);
const REGISTERED_WORKTREE_ADOPTION_IDENTITY =
  "sdlc/tickets/0247-failure-protects-registered-worktree.md@f66c6f35e4935f90507551f2c516a18d6aa4ff00";

test("the retired adoption record preserves its superseding identity", () => {
  const record = readFileSync(COMPLETION_RECORD, "utf8");

  expect(record).toContain(SUPERSEDING_ADOPTION_IDENTITY);
});

test("the retired green-main adoption records its superseding identity", () => {
  const record = readFileSync(GREEN_MAIN_COMPLETION_RECORD, "utf8");

  expect(record).toContain(REGISTERED_WORKTREE_ADOPTION_IDENTITY);
});
