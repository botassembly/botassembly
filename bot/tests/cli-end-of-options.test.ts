// Ticket 0005 — `--` is `bot run`'s boundary between options and its two
// positionals. The real CLI, parser, and runner receive dash-prefixed target,
// request, and run-wrapper spellings so none can silently become an option.
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { at, queue, realBoundary, router, runsIn, tempRoots, writes } from "./cli-boundary.ts";

const { scratch, cleanup } = tempRoots();
afterEach(cleanup);

async function assembly(home: string, name: string, workdirCapture?: string): Promise<void> {
  const flow = join(home, "assemblies", name, "flows", "main");
  const stage = join(flow, "01-work");
  await mkdir(stage, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies", name, "ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(stage, "STAGE.md"), "---\n---\nWork.\n"),
    ...(workdirCapture === undefined ? [] : [writeFile(join(stage, "success"), `#!/bin/sh\nprintf '%s' "$PWD" > '${workdirCapture}'\n`)]),
  ]);
  if (workdirCapture !== undefined) await chmod(join(stage, "success"), 0o755);
}

test("bot run treats dash-prefixed target and request after -- as positionals while applying options before it", async () => {
  const { root, home } = await scratch("bot-end-options-");
  const workdir = join(root, "worktree");
  const capture = join(root, "workdir.txt");
  await Promise.all([assembly(home, "--review", capture), mkdir(workdir)]);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  queue(faux, router({
    "Work.": (round) => round === 1 ? writes("$OUTPUT", "answer") : fauxAssistantMessage("done"),
  }), 2);

  await expect(main(["run", "start", "--in", workdir, "--", "--review/main", "--json"], held)).resolves.toBe(0);
  expect(Buffer.concat(stdout).toString()).toBe("answer");
  expect(Buffer.concat(stderr).toString()).toBe("");
  await expect(readFile(capture, "utf8")).resolves.toBe(workdir);
  const run = at(await runsIn(home), 0);
  await expect(readFile(join(home, "runs", run, "request.txt"), "utf8")).resolves.toBe("--json");
});

test("the marker named on run help makes --help and --id-file literal requests", async () => {
  const { root, home } = await scratch("bot-end-options-wrappers-");
  await assembly(home, "review");
  await mkdir(join(home, "runs"));
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);

  await expect(main(["run", "start", "--help"], held)).resolves.toBe(0);
  expect(Buffer.concat(stdout).toString()).toContain("usage: bot run start");
  const marker = "--";
  stdout.length = 0;

  queue(faux, router({
    "Work.": (round) => round % 2 === 1 ? writes("$OUTPUT", "answer") : fauxAssistantMessage("done"),
  }), 4);
  for (const request of ["--help", "--id-file"]) {
    const before = new Set(await runsIn(home));
    await expect(main(["run", "start", marker, "review/main", request], held)).resolves.toBe(0);
    expect(Buffer.concat(stdout).toString()).toBe("answer");
    stdout.length = 0;
    const run = (await runsIn(home)).find((name) => !before.has(name));
    expect(run).toBeDefined();
    await expect(readFile(join(home, "runs", run ?? "", "request.txt"), "utf8")).resolves.toBe(request);
  }
  expect(Buffer.concat(stderr).toString()).toBe("");
});
