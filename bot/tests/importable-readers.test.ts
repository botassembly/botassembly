import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, test } from "vitest";
import { builtPackage } from "./built-package.ts";
import { currentRecord } from "./current-record.ts";

const run = promisify(execFile);
const roots: string[] = [];
const RUN = "2026-08-11T17-00-00-aaaa";
const SESSION = "stages/01-read/1/session.jsonl";
let packageRoot: string;
let removePackage = async (): Promise<void> => {};

beforeAll(async () => {
  ({ packageRoot, remove: removePackage } = await builtPackage("bot-reader-package-"));
});

afterAll(async () => { await removePackage(); });

const transcript = [
  JSON.stringify({
    type: "message", timestamp: "2026-08-11T17:00:01.000Z",
    message: { role: "assistant", content: [{ type: "text", text: "outside reader" }, { type: "toolCall", id: "call-1", name: "lookup" }] },
  }),
  JSON.stringify({
    type: "message", timestamp: "2026-08-11T17:00:02.000Z",
    message: { role: "toolResult", toolCallId: "call-1", isError: false, content: "found" },
  }),
  "",
].join("\n");

async function consumer(): Promise<{ home: string; file: string; run: string }> {
  const root = await mkdtemp(join(tmpdir(), "bot-importable-readers-"));
  roots.push(root);
  const home = join(root, "home");
  const directory = join(home, "runs", RUN);
  await mkdir(join(directory, "stages/01-read/1"), { recursive: true });
  await chmod(home, 0o700);
  await mkdir(join(root, "pi-agent"), { mode: 0o700 });
  await writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n");
  await writeFile(join(directory, "record.jsonl"), currentRecord([
    { record: 1, event: "run_start", run: RUN, assembly: "reader", flow: "main", ts: "2026-08-11T17:00:00.000Z" },
    { event: "stage_start", stage: "01-read", retry: 1, session: SESSION, ts: "2026-08-11T17:00:01.000Z" },
    { event: "stage_end", stage: "01-read", retry: 1, exit: 0, cause: "success", ts: "2026-08-11T17:00:02.000Z" },
    { event: "run_end", exit: 0, cause: "success", ts: "2026-08-11T17:00:03.000Z" },
  ]));
  await writeFile(join(directory, SESSION), transcript);
  await mkdir(join(root, "node_modules"));
  await symlink(packageRoot, join(root, "node_modules", "bot"), "dir");
  await writeFile(join(root, "package.json"), '{"name":"outside","private":true,"type":"module"}\n');
  const file = join(root, "consumer.mjs");
  await writeFile(file, `
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as inspection from "bot/inspection";
import * as admin from "bot/admin-readings";
import * as oneRun from "bot/one-run";
import { heldRecord } from "bot/record-lines";
import * as readings from "bot/run-readings";
import * as mutations from "bot/mutation-readings";
import { renderSession, renderSessionTools } from "bot/session";

const [home, directory, session] = process.argv.slice(2);
const root = join(home, "..");
const env = { HOME: root, PWD: root, XDG_CACHE_HOME: join(root, "cache"), PI_CODING_AGENT_DIR: join(root, "pi-agent"), PATH: process.env.PATH };
const transcript = await readFile(join(directory, session), "utf8");
const record = await heldRecord(directory);
const parsed = readings.parseRunList([]);
if (!("query" in parsed)) throw new Error("the run list parse refused an empty request");
const listed = await readings.inspectRunList(home, parsed.query);
const rendered = await oneRun.inspectSession(home, "${RUN}", "01-read", undefined, false);
if (!record?.events.some((event) => event.run === "${RUN}")) throw new Error("record reader did not read the run");
if (!renderSession(transcript).some((line) => line.includes("outside reader"))) throw new Error("session reader did not render the transcript");
if (!renderSessionTools(transcript, "01-read").some((line) => line.includes("lookup"))) throw new Error("session tool reader did not render the call");
if (!listed.stdout.toString().includes("${RUN}")) throw new Error("run list reader did not list the run");
if (!rendered.output.toString().includes("outside reader")) throw new Error("one-run reader did not render the session");
const mutationResults = [
  await mutations.assemblyInstallReading(home, "missing", { json: true }, root, env),
  await mutations.assemblyLinkReading(home, "missing", { json: true }, root, env),
  await mutations.assemblyRemoveReading(home, "absent", true, root, env),
  await mutations.assemblyUpdateReading(home, "absent", true, root, env),
  await mutations.authImportReading("missing.json", true, root, env),
  await mutations.authLoginReading("faux", { json: true }, root, env),
  await mutations.authLogoutReading("-invalid", { json: true }, root, env),
  await mutations.runStartReading(home, "absent/main", undefined, { json: true }, root, env),
  await mutations.runResumeReading(home, "absent", { json: true }, root, env),
];
if (mutationResults.length !== 9 || mutationResults.some((result) =>
  Object.keys(result).sort().join(",") !== "exit,stderr,stdout" || typeof result.exit !== "number")) {
  throw new Error("the outside package did not call all nine mutation readings");
}
for (const [door, namespace] of Object.entries({ inspection, oneRun, readings, admin, mutations })) {
  for (const name of ["lockRun", "inspectPrune", "runCommand", "runOperation", "resumeOperation", "manage",
    "dispatchNewCommand", "commandReading", "configuredModelRuntime", "createProcessGroups"]) {
    if (name in namespace) throw new Error(door + " exposed private name " + name);
  }
}
if ("inspectRuns" in inspection) throw new Error("the inspection door still carries inspectRuns");
if ("inspectShow" in oneRun) throw new Error("the one-run door still carries inspectShow");
`);
  return { home, file, run: directory };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("a dependent package reads a run through the public reader doors", async () => {
  const outside = await consumer();
  await run(process.execPath, [outside.file, outside.home, outside.run, SESSION], { encoding: "utf8" });
});
