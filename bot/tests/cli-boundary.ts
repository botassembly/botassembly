// The CLI pin harness: an injected `CliBoundary` over the faux provider, so a
// test drives the REAL `main(["run", "start", ...])` — the real gating, the real
// scratch, the real record — with nothing stubbed but the model and the edges
// of the process (the cli-* idiom, 0041/0052).
//
// One copy, because `clock` and `realBoundary` had grown byte-identical in
// cli-subflow-pins.test.ts and cli-fanout-handoff.test.ts, and the `router`
// idiom beneath them was being retyped per file. This is the `boundary.ts`
// move (ticket 0063 item 12) applied to the in-process side: nothing
// behavioural lives here, and every assertion stayed in the test that makes it.
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { chmodSync, existsSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { bytewise } from "../src/model.ts";
import { expect } from "vitest";
import type { CliBoundary } from "../src/cli.ts";
import type { DriverClock } from "../src/process.ts";
import type { StageRuntimeContext } from "../src/flow.ts";

const clock: DriverClock = {
  milliseconds: () => performance.now(),
  timestamp: () => new Date().toISOString(),
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
};

export const TEST_INSTALLATION_ID = "018f2f4a-52f8-4c81-9b35-6ad2acdb70d8";

export function ensureTestInstallation(home: string): void {
  const record = join(home, "installation.json");
  if (existsSync(home) && !existsSync(record)) {
    writeFileSync(record, `${JSON.stringify({ schemaVersion: 1, kind: "bot.installation", data: { id: TEST_INSTALLATION_ID } })}\n`, { mode: 0o600 });
    chmodSync(home, 0o700);
  }
}

export function recordedStage(context: StageRuntimeContext) {
  const pwd = context.env["PWD"], input = context.env["INPUT"], output = context.env["OUTPUT"];
  const tmp = context.env["TMP"], skillsPath = context.env["SKILLS"];
  const facts = {
    workdir: { authored: context.node.kind === "STAGE" ? context.node.workdir ?? null : null,
      resolved: typeof pwd === "string" ? relative(context.workdirRoot, pwd) || "." : "." },
    tools: context.tools.map(({ name, description }) => ({ name, description })),
    skills: [...context.skills].map(([name, skill]) => ({ name, source: skill.source })),
  };
  if (context.mode.kind === "choose") return facts;
  const required = (value: string | undefined): string => {
    if (value === undefined) throw new TypeError("Fixture received incomplete stage slots.");
    return value;
  };
  return { ...facts, slots: { pwd: required(pwd), input: required(input), output: required(output),
    tmp: required(tmp), skills: required(skillsPath) } };
}

/** `stderrIsTTY` is the one caller-varying edge: it is false for every test
 *  that reads a record rather than watches a run, which is why a run's stderr
 *  stays empty here, and true for the one that pins the progress display. */
export function realBoundary(root: string, home: string, output: Buffer[], errors: Buffer[], stderrIsTTY = false) {
  const config = join(home, "config.yaml");
  if (existsSync(home) && !existsSync(config)) writeFileSync(config, "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n");
  ensureTestInstallation(home);
  const faux = fauxProvider({ tokensPerSecond: 10_000, models: [{ id: "faux-1" }] });
  const models = createModels();
  models.setProvider(faux.provider);
  const held: CliBoundary = {
    cwd: root,
    env: { ...process.env, BOT_HOME: home, PWD: root, XDG_CACHE_HOME: join(root, "cache") },
    stdinIsTTY: true,
    stderrIsTTY,
    readStdin: () => Promise.resolve(Buffer.alloc(0)),
    stdout: (bytes) => { output.push(Buffer.from(bytes)); },
    stderr: (bytes) => { errors.push(Buffer.from(bytes)); },
    clock,
    models,
  };
  return { held, faux };
}

/** Temp roots a test file owns and removes. Held per caller rather than in
 *  module state, so two test files sharing a worker cannot delete each
 *  other's trees. */
export function tempRoots() {
  const held: string[] = [];
  return {
    scratch: async (prefix: string): Promise<{ root: string; home: string }> => {
      const root = await mkdtemp(join(tmpdir(), prefix));
      held.push(root);
      return { root, home: join(root, "home") };
    },
    cleanup: (): Promise<void> =>
      Promise.all(held.splice(0).map((root) => rm(root, { recursive: true, force: true }))).then(() => undefined),
  };
}

/** The runs a home holds, by the same rule `runNames` uses: a `.lock` is a
 *  reservation and never a run (inspection.ts). */
export async function runsIn(home: string): Promise<string[]> {
  return (await readdir(join(home, "runs"))).filter((name) => !name.endsWith(".lock")).sort(bytewise);
}

/** Every file under a tree, as bytewise-sorted relative paths. */
export async function tree(root: string, prefix = ""): Promise<string[]> {
  const held: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) held.push(...await tree(join(root, entry.name), path));
    else held.push(path);
  }
  return held.sort();
}

/** A pause the assembly copy runs into after `file` has landed, and that the
 *  test closes — 0116's `captured` seam. Every other file copies straight
 *  through. Pausing on the LAST file in bytewise order is a pause on a
 *  COMPLETED capture, which is where 0117's witnesses edit the source tree. */
export function pauseAfter(file: string) {
  let parked = (): void => undefined;
  const arrived = new Promise<void>((resolve) => { parked = resolve; });
  let resume = (): void => undefined;
  const holding = new Promise<void>((resolve) => { resume = resolve; });
  return {
    arrived,
    resume,
    captured: async (held: string): Promise<void> => {
      if (held !== file) return;
      parked();
      await holding;
    },
  };
}

export type Message = ReturnType<typeof fauxAssistantMessage>;
export interface Seen { systemPrompt: string; messages: string }

// The faux queue is consumed in arrival order and branches — and a subflow
// batch's children — run at once, so a positional script cannot say which
// stage a call belongs to. Every queued step is instead the SAME router: it
// reads the system prompt the real runner built, the one honest seam, and
// answers as whichever stage asked.
export function router(routes: Record<string, (round: number) => Message | Promise<Message>>, seen: Seen[] = []) {
  const rounds = new Map<string, number>();
  return (context: { systemPrompt?: string; messages?: unknown[] }): Message | Promise<Message> => {
    const prompt = context.systemPrompt ?? "";
    seen.push({ systemPrompt: prompt, messages: JSON.stringify(context.messages ?? []) });
    const key = Object.keys(routes).find((marker) => prompt.includes(marker));
    const route = key === undefined ? undefined : routes[key];
    if (key === undefined || route === undefined) throw new Error(`No route for system prompt: ${prompt.slice(0, 200)}`);
    const round = (rounds.get(key) ?? 0) + 1;
    rounds.set(key, round);
    return route(round);
  };
}

export function queue(faux: ReturnType<typeof fauxProvider>, step: ReturnType<typeof router>, count: number): void {
  faux.setResponses(Array.from({ length: count }, () => step));
}

export function writes(path: string, content: string): Message {
  return fauxAssistantMessage([fauxToolCall("write", { path, content })], { stopReason: "toolUse" });
}

export function callsSubflow(calls: Record<string, string>[]): Message {
  return fauxAssistantMessage([fauxToolCall("subflow", { calls })], { stopReason: "toolUse" });
}

export async function events(path: string): Promise<Record<string, unknown>[]> {
  return (await readFile(path, "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

export function at<Item>(items: readonly Item[], index: number): Item {
  const held = items[index];
  if (held === undefined) throw new Error(`nothing at index ${String(index)}`);
  return held;
}

// The record readers. `repeat` appears iff the stage sits inside a LOOP
// (record.md "Identity"), so asking for a stage OUTSIDE one means asking for
// the event that does not carry the field at all.
export function start(events: Record<string, unknown>[], stage: string, repeat?: number): Record<string, unknown> | undefined {
  return events.find((event) =>
    event["event"] === "stage_start" && event["stage"] === stage
    && (repeat === undefined ? !("repeat" in event) : event["repeat"] === repeat));
}

export function received(event: Record<string, unknown> | undefined): { name: string; path: string; sha256: string }[] {
  expect(event).toBeDefined();
  expect(Array.isArray(event?.["received"])).toBe(true);
  return event?.["received"] as { name: string; path: string; sha256: string }[];
}

export function sealedOutput(events: Record<string, unknown>[], stage: string, repeat?: number): { path: string; sha256: string } {
  const end = events.find((event) =>
    event["event"] === "stage_end" && event["stage"] === stage
    && (repeat === undefined ? !("repeat" in event) : event["repeat"] === repeat));
  expect(end).toMatchObject({ exit: 0, cause: "success", sealed: true });
  return (end as { output: { path: string; sha256: string } }).output;
}
