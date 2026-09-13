// Ticket 0132: a machine reading must say how each fresh context was built,
// rather than making its consumer re-derive prompt composition from runtime
// source. This real two-stage run covers prepared root input and a named
// inherited output, plus every optional system-prompt source.
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import * as inspection from "../src/public-inspection.ts";
import { events, queue, realBoundary, router, sealedOutput, tempRoots, writes, type Seen } from "./cli-boundary.ts";

const promptConstruction = (inspection as unknown as {
  promptConstruction: (event: Record<string, unknown>) => unknown;
}).promptConstruction;

const { scratch, cleanup } = tempRoots();
afterEach(async () => { await cleanup(); });

const GATHER = "Gather the quartz evidence.";
const FINISH = "Publish the quartz finding.";

async function fixture(): Promise<{ root: string; home: string; workspace: string }> {
  const { root, home } = await scratch("bot-prompt-construction-");
  const assembly = join(home, "assemblies/review");
  const flow = join(assembly, "flows/main");
  const gather = join(flow, "01-gather");
  const finish = join(flow, "02-finish");
  const workspace = join(root, "workspace");
  await Promise.all([
    mkdir(gather, { recursive: true }),
    mkdir(finish, { recursive: true }),
    mkdir(join(assembly, "skills/house-style"), { recursive: true }),
    mkdir(join(assembly, "subflows/oracle"), { recursive: true }),
    mkdir(workspace, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n"),
    writeFile(join(assembly, "ASSEMBLY.md"), "---\nintelligence: default\n---\nReview quartz claims.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: review flow\n---\nCheck evidence before publishing.\n"),
    writeFile(join(gather, "STAGE.md"), `---\n---\n${GATHER}\n`),
    writeFile(join(gather, "before"), "#!/bin/sh\nrm \"$INPUT/request.txt\"\nprintf 'prepared quartz\\n' > \"$INPUT/prepared.txt\"\n"),
    writeFile(join(finish, "STAGE.md"), `---\n---\n${FINISH}\n`),
    writeFile(join(finish, "schema.md"), "---\nfinding: str\n---\n"),
    writeFile(join(assembly, "skills/house-style/SKILL.md"), "---\ndescription: Keep the house style.\n---\nUse short sentences.\n"),
    writeFile(join(assembly, "subflows/oracle/FLOW.md"), "---\ndescription: Check one difficult claim.\n---\n"),
    writeFile(join(assembly, "subflows/oracle/01-check.md"), "---\n---\nCheck the claim.\n"),
    writeFile(join(workspace, "AGENTS.md"), "Workspace quartz conventions.\n"),
  ]);
  await chmod(join(gather, "before"), 0o755);
  return { root, home, workspace };
}

function construction(reading: Record<string, unknown>[], stage: string) {
  for (const event of reading) {
    if (event["stage"] !== stage) continue;
    const result = promptConstruction(event) as { available: boolean; sources?: unknown };
    if (result.available) return result;
  }
  return undefined;
}

test("show --json gives the actual post-hook root prompt and a later inherited prompt", async () => {
  const { root, home, workspace } = await fixture();
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  const seen: Seen[] = [];
  queue(faux, router({
    [GATHER]: (round) => round === 1 ? writes("$OUTPUT", "quartz evidence") : fauxAssistantMessage("done"),
    [FINISH]: (round) => round === 1 ? writes("$OUTPUT", "---\nfinding: supported\n---\n") : fauxAssistantMessage("done"),
  }, seen), 4);

  const exit = await main([
    "run", "start", "review/main", "the original request", "--in", workspace,
    "--local-context", "announce",
  ], held);
  expect(exit, Buffer.concat(stderr).toString()).toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");

  const runName = (await readdir(join(home, "runs")))[0] ?? "";
  const recorded = await events(join(home, "runs", runName, "record.jsonl"));
  const gathered = sealedOutput(recorded, "01-gather");

  const machineOut: Buffer[] = [];
  const machineErr: Buffer[] = [];
  const { held: machine } = realBoundary(root, home, machineOut, machineErr);
  await expect(main(["run", "events", runName, "--json"], machine)).resolves.toBe(0);
  expect(Buffer.concat(machineErr).toString()).toBe("");
  const reading = (JSON.parse(Buffer.concat(machineOut).toString()) as { data: { events: Record<string, unknown>[] } }).data.events;

  const rootSources = [
    { source: "assembly", path: "assembly/ASSEMBLY.md" },
    { source: "workspace", mode: "announce", path: "$PWD/AGENTS.md" },
    { source: "flow", path: "assembly/flows/main/FLOW.md" },
    { source: "stage", path: "assembly/flows/main/01-gather/STAGE.md" },
    { source: "skill", name: "house-style", path: "assembly/skills/house-style/SKILL.md" },
    { source: "helper", name: "oracle", path: "assembly/subflows/oracle/FLOW.md" },
    { source: "input", name: "prepared.txt", path: "prepared.txt" },
    { source: "harness", system: "stages/01-gather/1/system.txt", firstTurn: "stages/01-gather/1/first-turn.txt" },
  ];
  const laterSources = [
    { source: "assembly", path: "assembly/ASSEMBLY.md" },
    { source: "workspace", mode: "announce", path: "$PWD/AGENTS.md" },
    { source: "flow", path: "assembly/flows/main/FLOW.md" },
    { source: "stage", path: "assembly/flows/main/02-finish/STAGE.md" },
    { source: "schema", path: "assembly/flows/main/02-finish/schema.md" },
    { source: "skill", name: "house-style", path: "assembly/skills/house-style/SKILL.md" },
    { source: "helper", name: "oracle", path: "assembly/subflows/oracle/FLOW.md" },
    { source: "input", name: "gather.txt", path: gathered.path },
    { source: "harness", system: "stages/02-finish/1/system.txt", firstTurn: "stages/02-finish/1/first-turn.txt" },
  ];
  const rootConstruction = construction(reading, "01-gather");
  const laterConstruction = construction(reading, "02-finish");
  expect(rootConstruction).toEqual({ available: true, sources: rootSources });
  expect(laterConstruction).toEqual({ available: true, sources: laterSources });

  // Provenance has one carrier regardless of whether a before hook ran. The
  // completed hook is durable before prompt preparation publishes its result.
  const sourceEvents = reading.filter((event) => Array.isArray(event["prompt"]));
  expect(sourceEvents.map((event) => [event["event"], event["stage"]])).toEqual([
    ["prompt", "01-gather"],
    ["prompt", "02-finish"],
  ]);
  const rootHook = reading.findIndex((event) => event["event"] === "hook" && event["stage"] === "01-gather");
  const rootPrompt = reading.findIndex((event) => event["event"] === "prompt" && event["stage"] === "01-gather");
  expect(rootHook).toBeLessThan(rootPrompt);

  // This is one integrated witness: `before` replaced the original request,
  // and the harness-authored system and first-turn descriptors are named in
  // that same post-hook decomposition. The retained bytes equal what the
  // provider actually received on its first call.
  const runDirectory = join(home, "runs", runName);
  const system = await readFile(join(runDirectory, "stages/01-gather/1/system.txt"), "utf8");
  const firstTurn = await readFile(join(runDirectory, "stages/01-gather/1/first-turn.txt"), "utf8");
  expect(firstTurn).toBe("The files in `$INPUT` are:\n- `prepared.txt`\n\nUse them to complete the instructions, then write the result to `$OUTPUT`.\n");
  const firstCall = seen.find((call) => call.systemPrompt.includes(GATHER));
  expect(firstCall?.systemPrompt).toBe(system);
  expect(firstCall?.messages).toContain(JSON.stringify(firstTurn));

  // The decomposition points to the retained prompt bytes; it does not copy
  // either rendered prompt into the record event.
  const serialized = JSON.stringify(laterConstruction);
  for (const path of ["stages/02-finish/1/system.txt", "stages/02-finish/1/first-turn.txt"]) {
    const bytes = await readFile(join(runDirectory, ...path.split("/")), "utf8");
    expect(bytes.length).toBeGreaterThan(0);
    expect(serialized).not.toContain(bytes);
  }
});

test("a historical stage says prompt provenance was not recorded without changing its raw event", () => {
  const historical = {
    ts: "2026-08-01T10:00:01.000Z", event: "stage_start",
    stage: "01-work", retry: 1, received: [], options: [],
  };
  const raw = JSON.stringify(historical);

  expect(promptConstruction(historical)).toEqual({
    available: false,
    reason: "Prompt provenance was not recorded for this stage attempt.",
  });
  expect(JSON.stringify(historical)).toBe(raw);
  expect(historical).not.toHaveProperty("prompt");
});
