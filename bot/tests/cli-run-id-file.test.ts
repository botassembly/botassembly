// `bot run --id-file` gives an invoking program the identity of the run it
// started without changing stdout, which remains the run's answer. The hook
// checks the file before the agent can start; the record then proves its value
// names this run rather than another concurrent run.
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { events, realBoundary, runsIn, tempRoots, writes } from "./cli-boundary.ts";

const roots = tempRoots();

afterEach(() => roots.cleanup());

test("--id-file identifies this run before its first hook", async () => {
  const { root, home } = await roots.scratch("bot-run-id-file-");
  const stage = join(home, "assemblies/review/flows/main/01-work");
  const idFile = join(root, "started-run");
  const idFileArgument = "started-run";
  await mkdir(stage, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(home, "assemblies/review/flows/main/FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(stage, "STAGE.md"), "---\n---\nWork.\n"),
    writeFile(join(stage, "before"), "#!/bin/sh\ntest -s \"$RUN_ID_FILE\"\n"),
  ]);
  await chmod(join(stage, "before"), 0o755);

  const stdout: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, []);
  faux.setResponses([writes("$OUTPUT", "the answer"), fauxAssistantMessage("done")]);
  await expect(main(["run", "start", "review/main", "--id-file", idFileArgument, "the request"], {
    ...held, env: { ...held.env, RUN_ID_FILE: idFile },
  })).resolves.toBe(0);

  const run = (await runsIn(home))[0] ?? "";
  expect(run).not.toBe("");
  expect((await readFile(idFile, "utf8")).trim()).toBe(run);
  expect((await events(join(home, "runs", run, "record.jsonl")))[0]).toMatchObject({ event: "run_start", run });
  expect(Buffer.concat(stdout).toString()).toBe("the answer");
});
