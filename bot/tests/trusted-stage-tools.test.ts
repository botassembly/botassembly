import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { main } from "../src/cli.ts";
import { inspectExplain } from "../src/one-run.ts";
import { at, events, realBoundary, runsIn, tempRoots } from "./cli-boundary.ts";

const roots = tempRoots();
afterEach(() => roots.cleanup());

async function assembly(home: string): Promise<void> {
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(flow, "01-work.md"), "---\nretries: 0\n---\nDo the work.\n"),
  ]);
}

function call(name: string, parameters: object) {
  return fauxAssistantMessage([fauxToolCall(name, parameters)], { stopReason: "toolUse" });
}

test("a trusted stage receives ordinary file and compound Bash tools with retained evidence", async () => {
  const { root, home } = await roots.scratch("bot-trusted-stage-tools-");
  const outside = await mkdtemp(join(tmpdir(), "bot-trusted-stage-outside-"));
  try {
    await assembly(home);
    const outsideFile = join(outside, "written.txt"), output: Buffer[] = [], errors: Buffer[] = [];
    const { held, faux } = realBoundary(root, home, output, errors);
    faux.setResponses([
      call("write", { path: outsideFile, content: "outside" }),
      call("bash", { command: "printf first > compound.txt; printf second >> compound.txt; cat compound.txt" }),
      call("write", { path: "$OUTPUT", content: "answer" }),
      fauxAssistantMessage("done"),
      fauxAssistantMessage("done"),
    ]);
    expect(await main(["run", "start", "review/main", "request"], held)).toBe(0);
    expect(Buffer.concat(errors)).toEqual(Buffer.alloc(0));
    expect(await readFile(outsideFile, "utf8")).toBe("outside");
    expect(await readFile(join(root, "compound.txt"), "utf8")).toBe("firstsecond");
    const run = at(await runsIn(home), 0), directory = join(home, "runs", run);
    const record = await events(join(directory, "record.jsonl"));
    expect(record.find((event) => event["event"] === "stage_start")).not.toHaveProperty("access");
    expect(record).not.toContainEqual(expect.objectContaining({ event: "tool_denied" }));
    const explained = await inspectExplain(home, run, undefined, true);
    expect(explained.exitCode).toBe(0);
    expect(JSON.parse(explained.output.toString())).toMatchObject({ stages: [
      { tools: { settled: 3, byName: { write: 2, bash: 1 } } },
    ] });
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
});
