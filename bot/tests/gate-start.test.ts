// Ticket 0150 — a gate's wait is observable, not an unexplained quiet period.
// The gate below stops on a file rendezvous, so reading the record while it is
// blocked proves ordering without relying on a sleep or on how long the child
// takes to start.
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { hashBytes } from "../src/record.ts";
import { events, realBoundary, runsIn, tempRoots, writes } from "./cli-boundary.ts";

const roots = tempRoots();
afterEach(() => roots.cleanup());

async function untilStarted(root: string): Promise<void> {
  for (let turn = 0; turn < 20_000; turn += 1) {
    const marker = await readFile(join(root, "gate-started"), "utf8").then((value) => value, () => undefined);
    if (marker === "running\n") return;
    await new Promise((resolve) => { setImmediate(resolve); });
  }
  throw new Error("the gate never reached its rendezvous");
}

test("a running gate is durable before it finishes, with no completed verdict yet", async () => {
  const { root, home } = await roots.scratch("bot-gate-start-");
  const stage = join(home, "assemblies/review/flows/main/01-work");
  const gate = "#!/bin/sh\nprintf 'running\\n' > gate-started\nwhile [ ! -e release-gate ]; do sleep 0.01; done\nexit 0\n";
  await mkdir(stage, { recursive: true });
  await Promise.all([
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(home, "assemblies/review/flows/main/FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(stage, "STAGE.md"), "---\n---\nWrite the report.\n"),
    writeFile(join(stage, "gate"), gate),
  ]);
  await chmod(join(stage, "gate"), 0o755);
  const output: Buffer[] = [];
  const errors: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, output, errors);
  faux.setResponses([writes("$OUTPUT", "the report"), fauxAssistantMessage("done")]);

  const running = main(["run", "start", "review/main", "request"], held);
  await untilStarted(root);
  const run = (await runsIn(home))[0] ?? "";
  const live = await events(join(home, "runs", run, "record.jsonl"));
  await writeFile(join(root, "release-gate"), "release\n");

  await expect(running).resolves.toBe(0);
  expect(live.filter((event) => event["event"] === "gate_start")).toEqual([
    expect.objectContaining({
      stage: "01-work", retry: 1, file: "flows/main/01-work/gate", sha256: hashBytes(gate),
    }),
  ]);
  expect(live.some((event) => event["event"] === "check" && event["check"] === "gate")).toBe(false);
});
