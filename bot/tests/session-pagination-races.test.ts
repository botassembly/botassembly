import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";

const race = vi.hoisted(() => ({ target: "", mode: "", changed: false }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...original,
    open: async (...arguments_: Parameters<typeof original.open>) => {
      const descriptor = await original.open(...arguments_);
      if (arguments_[0].toString() !== race.target) return descriptor;
      return {
        stat: descriptor.stat.bind(descriptor),
        close: descriptor.close.bind(descriptor),
        read: async (buffer: NodeJS.ArrayBufferView, offset: number, length: number, position: number) => {
          if (!race.changed && position >= 64 * 1024) {
            race.changed = true;
            if (race.mode === "append") await original.appendFile(race.target, "later");
            if (race.mode === "replace") {
              await original.rename(race.target, `${race.target}.old`);
              await original.writeFile(race.target, "replacement");
            }
          }
          return descriptor.read(buffer, offset, length, position);
        },
      };
    },
  };
});

import { currentRecord } from "./current-record.ts";
import { invokeCli } from "./invoke.ts";

const roots: string[] = [];
const RUN = "2026-09-05T15-00-00-race";

afterEach(async () => {
  race.target = "";
  race.mode = "";
  race.changed = false;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function raceHome(): Promise<{ home: string; session: string }> {
  const home = await mkdtemp(join(tmpdir(), "bot-session-page-race-"));
  roots.push(home);
  const session = join(home, "runs", RUN, "stages/01-work/1/session.jsonl");
  await mkdir(join(session, ".."), { recursive: true });
  const first = JSON.stringify({
    type: "message", timestamp: "2026-09-05T15:00:00.000Z",
    message: { role: "assistant", content: [{ type: "text", text: `first ${"x".repeat(100_000)}` }] },
  });
  const second = JSON.stringify({
    type: "message", timestamp: "2026-09-05T15:00:01.000Z",
    message: { role: "user", content: [{ type: "text", text: "second" }] },
  });
  await writeFile(session, `${first}\n${second}\n`);
  await writeFile(join(home, "runs", RUN, "record.jsonl"), currentRecord([
    { record: 1, event: "run_start", run: RUN, assembly: "paging", flow: "main", ts: "2026-09-05T15:00:00.000Z" },
    { event: "stage_start", stage: "01-work", retry: 1, session: "stages/01-work/1/session.jsonl", ts: "2026-09-05T15:00:01.000Z" },
  ]));
  return { home, session };
}

test.each(["append", "replace"] as const)("a mid-page %s publishes no transcript fragment", async (mode) => {
  const held = await raceHome();
  race.target = held.session;
  race.mode = mode;

  const read = await invokeCli(["run", "session", RUN, "01-work", "--limit", "1"], { home: held.home });

  expect(race.changed).toBe(true);
  expect(read.out).toBe("");
  expect(read.code).toBe(5);
  expect(read.out).not.toContain("first ");
});
