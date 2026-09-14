// Ticket 0289 opened this suite with one operation, `run.session`, compared
// live against its importable counterpart. Ticket 0291 added `run.list`,
// `run.show`, and `run.record`. Ticket 0295 added the remaining ten read-only
// operations. Every other operation sits in exactly one of two checked in
// allowlists until the export tickets shrink them.
//
// The map is the trigger for both allowlist directions (`bot/package.json`'s
// export paths carry no operation names): an operation absent from the map
// and from both lists fails, and an operation named in the map and in an
// allowlist also fails, so a landed export forces its stale allowlist entry
// out. `operationFault` below is the one function that states that rule, and
// the "stale" and "missing" tests exercise it directly against mutated
// copies, the same way the ticket's acceptance section demonstrates red.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, expect, test } from "vitest";
import { CLI_CONTRACTS, type NewOperation } from "../src/cli-contract.ts";
import { currentRecord } from "./current-record.ts";

const run = promisify(execFile);
const roots: string[] = [];
const RUN = "2026-09-14T09-00-00-contract";
const STAGE = "01-read";
const SESSION = `stages/${STAGE}/1/session.jsonl`;
const OUTPUT = `stages/${STAGE}/1/1/output.txt`;
const CAPTURE = `stages/${STAGE}/1/1/checks/gate.txt`;
const REQUEST = "request.txt";
const ASSEMBLY = "review";
const TARGET = `${ASSEMBLY}/main`;
const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

// Seventeen operations carry `mutates: false` (ticket "Current facts").
// Fifteen of them are compared live below. `auth.list` and `model.list` need a Pi
// runtime on the boundary and have no importable counterpart yet.
const PENDING_EXPORT: readonly NewOperation[] = ["auth.list", "model.list"];

// The nine operations that mutate the Bot home or the credential store. The
// next ticket admits them under ruling 1 (2026-09-14): `run.start` and
// `run.resume` start the run in a child process; every other admitted
// mutation still runs in the importer's process.
const PENDING_MUTATION: readonly NewOperation[] = [
  "assembly.install", "assembly.link", "assembly.remove", "assembly.update",
  "auth.import", "auth.login", "auth.logout", "run.start", "run.resume",
];

// Each entry names the function the command itself calls, or the wrapper that
// drives the command's own handler. `run-session-command.ts:124` calls
// `inspectSession` (`one-run.ts:413`); `run-list-command.ts:38` calls
// `inspectRunList`; `run-show-command.ts:22` and `runShowReading` both call
// `readRunShow`; `run-record-command.ts:54` and `runRecordReading` both call
// `inspectRawShow`. The ten ticket 0295 added drive their handler through the
// collecting boundary in `bot/src/command-reading.ts`, so no private rule is
// copied.
const COUNTERPARTS: Readonly<Partial<Record<NewOperation, string>>> = {
  "run.session": "inspectSession (bot/one-run)",
  "run.list": "inspectRunList (bot/run-readings)",
  "run.show": "runShowReading (bot/run-readings)",
  "run.record": "runRecordReading (bot/run-readings)",
  "assembly.check": "assemblyCheckReading (bot/admin-readings)",
  "assembly.list": "assemblyListReading (bot/admin-readings)",
  capabilities: "capabilitiesReading (bot/admin-readings)",
  "home.busy": "homeBusyReading (bot/admin-readings)",
  "home.show": "homeShowReading (bot/admin-readings)",
  "intelligence.list": "intelligenceListReading (bot/admin-readings)",
  "run.check": "runCheckReading (bot/run-readings)",
  "run.checklist": "runChecklistReading (bot/run-readings)",
  "run.events": "runEventsReading (bot/run-readings)",
  "run.output": "runOutputReading (bot/run-readings)",
  "run.request": "runRequestReading (bot/run-readings)",
};

function operationFault(
  operations: readonly string[],
  pendingExport: readonly string[],
  pendingMutation: readonly string[],
  counterparts: Readonly<Record<string, unknown>>,
): string | undefined {
  for (const operation of operations) {
    const listed = [pendingExport.includes(operation), pendingMutation.includes(operation), operation in counterparts];
    const count = listed.filter(Boolean).length;
    if (count === 0) return `${operation} has no importable counterpart and sits in no allowlist`;
    if (count > 1) return `${operation} sits in the counterpart map and in an allowlist`;
  }
  return undefined;
}

test("every operation has exactly one importable counterpart or allowlist entry", () => {
  const operations = CLI_CONTRACTS.map((descriptor) => descriptor.operation);
  expect(operationFault(operations, PENDING_EXPORT, PENDING_MUTATION, COUNTERPARTS)).toBeUndefined();
});

// Red demonstration 1: a 27th operation named in neither list nor the map.
test("an operation added to CLI_CONTRACTS with no export or allowlist entry fails naming it", () => {
  const operations = [...CLI_CONTRACTS.map((descriptor) => descriptor.operation), "assembly.retire"];
  expect(operationFault(operations, PENDING_EXPORT, PENDING_MUTATION, COUNTERPARTS))
    .toBe("assembly.retire has no importable counterpart and sits in no allowlist");
});

// Red demonstration 2, one mutated copy per exported operation because
// `operationFault` returns on the first offender. Dropping one export without
// returning its name to an allowlist fails naming exactly that operation.
for (const operation of [
  "run.list", "run.show", "run.record", "assembly.check", "assembly.list", "capabilities",
  "home.busy", "home.show", "intelligence.list", "run.check", "run.checklist", "run.events",
  "run.output", "run.request",
]) {
  test(`${operation} dropped from the counterpart map with no allowlist entry fails naming it`, () => {
    const operations = CLI_CONTRACTS.map((descriptor) => descriptor.operation);
    const shrunk = Object.fromEntries(Object.entries(COUNTERPARTS).filter(([name]) => name !== operation));
    expect(operationFault(operations, PENDING_EXPORT, PENDING_MUTATION, shrunk))
      .toBe(`${operation} has no importable counterpart and sits in no allowlist`);
  });
}

// Red demonstration 3: an operation named in both the map and an allowlist.
test("an operation named in both the counterpart map and an allowlist fails naming the stale entry", () => {
  const operations = CLI_CONTRACTS.map((descriptor) => descriptor.operation);
  const stale = { ...COUNTERPARTS, "auth.list": "authListReading (bot/admin-readings)" };
  expect(operationFault(operations, [...PENDING_EXPORT], PENDING_MUTATION, stale))
    .toBe("auth.list sits in the counterpart map and in an allowlist");
});

test("the allowlists and the map cover CLI_CONTRACTS exactly once, with no leftovers", () => {
  const operations = CLI_CONTRACTS.map((descriptor) => descriptor.operation);
  expect(new Set(operations).size).toBe(operations.length);
  expect(PENDING_EXPORT.length + PENDING_MUTATION.length + Object.keys(COUNTERPARTS).length).toBe(operations.length);
});

const transcript = [
  JSON.stringify({
    type: "message", timestamp: "2026-09-14T09:00:01.000Z",
    message: { role: "assistant", content: [{ type: "text", text: "live contract reader" }] },
  }),
  "",
].join("\n");

// Every live comparison runs the command in a child process and the import in
// the consumer's own process, then requires the same stdout, the same stderr,
// the same exit code, and one marker inside the named stream. A refusal leaves
// stdout empty, so its marker is searched on stderr.
const PREAMBLE = `
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const runChild = promisify(execFile);
const [home, cli, plain, output] = process.argv.slice(2);
const cwd = process.cwd();
const env = { ...process.env };

async function commandResult(args) {
  const settled = await runChild(process.execPath, [cli, ...args],
    { env, encoding: "buffer", maxBuffer: 16 * 1024 * 1024 }).then(
    (done) => ({ exit: 0, stdout: done.stdout, stderr: done.stderr }),
    (reason) => ({ exit: reason.code, stdout: reason.stdout, stderr: reason.stderr }));
  return { exit: settled.exit, stdout: Buffer.from(settled.stdout ?? ""), stderr: Buffer.from(settled.stderr ?? "") };
}

function agree(operation, imported, commanded, marker, stream) {
  if (typeof commanded.exit !== "number") {
    throw new Error(\`the \${operation} command left no exit code, so a signal ended it\`);
  }
  if (imported.exit !== commanded.exit) {
    throw new Error(\`\${operation} exit differs: command \${commanded.exit}, import \${imported.exit}\`);
  }
  for (const name of ["stdout", "stderr"]) {
    const held = Buffer.from(imported[name]);
    if (!held.equals(commanded[name])) {
      throw new Error(\`\${operation} \${name} differs: command \${commanded[name].length} bytes, import \${held.length} bytes\`);
    }
  }
  if (!commanded[stream].toString("utf8").includes(marker)) {
    throw new Error(\`the compared \${operation} bytes did not carry \${marker} on \${stream}\`);
  }
}
`;

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

async function fixture(consumer: string): Promise<{ home: string; file: string; plain: string; output: string }> {
  const root = await mkdtemp(join(tmpdir(), "bot-library-contract-"));
  roots.push(root);
  const home = join(root, "home");
  const directory = join(home, "runs", RUN);
  const request = Buffer.from(`retained request of ${RUN}\n`);
  const sealed = Buffer.from(`sealed output of ${RUN}\n`);
  const capture = Buffer.from(`gate capture of ${RUN}\n`);
  await mkdir(join(directory, dirname(SESSION)), { recursive: true });
  await mkdir(join(directory, dirname(CAPTURE)), { recursive: true });
  await writeFile(join(directory, REQUEST), request);
  await writeFile(join(directory, ...OUTPUT.split("/")), sealed);
  await writeFile(join(directory, ...CAPTURE.split("/")), capture);
  await writeFile(join(directory, "record.jsonl"), currentRecord([
    { record: 1, event: "run_start", run: RUN, assembly: ASSEMBLY, flow: "main", ts: "2026-09-14T09:00:00.000Z",
      request: { path: REQUEST, sha256: sha256(request), bytes: request.length, via: "argument" } },
    { event: "stage_start", stage: STAGE, retry: 1, session: SESSION, ts: "2026-09-14T09:00:01.000Z" },
    { event: "tool_call", stage: STAGE, retry: 1, tool: "mark", item: 1, decision: "done",
      evidence: `the reader saw ${RUN}`, ts: "2026-09-14T09:00:01.500Z" },
    { event: "check", stage: STAGE, retry: 1, check: "gate", exit: 0, capture: CAPTURE, ts: "2026-09-14T09:00:01.700Z" },
    { event: "stage_end", stage: STAGE, retry: 1, exit: 0, cause: "success", sealed: true, judged: true,
      output: { path: OUTPUT, sha256: sha256(sealed) }, ts: "2026-09-14T09:00:02.000Z" },
    { event: "run_end", exit: 0, cause: "success", ts: "2026-09-14T09:00:03.000Z" },
  ]));
  await writeFile(join(directory, SESSION), transcript);
  await writeFile(join(home, "config.yaml"),
    "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n");
  await mkdir(join(home, "assemblies", ASSEMBLY, "flows", "main"), { recursive: true });
  await writeFile(join(home, "assemblies", ASSEMBLY, "ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n");
  await writeFile(join(home, "assemblies", ASSEMBLY, "flows", "main", "FLOW.md"), "---\ndescription: main\n---\n");
  await writeFile(join(home, "assemblies", ASSEMBLY, "flows", "main", "01-work.md"), "---\n---\nWork.\n");
  // `home show` reads the home's own mode and refuses a world-readable one.
  await chmod(home, 0o700);
  const plain = join(root, "plain");
  await mkdir(plain);
  await mkdir(join(root, "node_modules"));
  await symlink(join(import.meta.dirname, ".."), join(root, "node_modules", "bot"), "dir");
  const file = join(root, "consumer.mjs");
  await writeFile(file, consumer);
  return { home, file, plain, output: join(directory, ...OUTPUT.split("/")) };
}

async function live(consumer: string): Promise<void> {
  const held = await fixture(consumer);
  await run(process.execPath, [held.file, held.home, CLI, held.plain, held.output], { encoding: "utf8" });
}

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

test("run.session compared live: `bot run session --raw` and inspectSession(raw=true) agree byte for byte", async () => {
  await live(`
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { inspectSession } from "bot/one-run";

const runChild = promisify(execFile);
const [home, cli] = process.argv.slice(2);

const imported = await inspectSession(home, "${RUN}", "${STAGE}", undefined, true, undefined);
if (imported.cause !== undefined) throw new Error(\`import failed: \${imported.cause}\`);
const importedBytes = Buffer.from(imported.output);

const commanded = await runChild(process.execPath,
  [cli, "run", "session", "${RUN}", "${STAGE}", "--raw"],
  { env: { ...process.env, BOT_HOME: home }, encoding: "buffer", maxBuffer: 16 * 1024 * 1024 });
const commandedBytes = Buffer.from(commanded.stdout);

if (!importedBytes.equals(commandedBytes)) {
  throw new Error(\`run.session bytes differ: command \${commandedBytes.length} bytes, import \${importedBytes.length} bytes\`);
}
if (!commandedBytes.toString("utf8").includes("live contract reader")) {
  throw new Error("the compared bytes did not carry the fixture transcript");
}
`);
});

test("run.list compared live: `bot run list --json` and inspectRunList agree byte for byte", async () => {
  await live(`${PREAMBLE}
import { inspectRunList, parseRunList } from "bot/run-readings";

const parsed = parseRunList(["--json"]);
if (!("query" in parsed)) throw new Error("the run list parse refused --json");
const imported = await inspectRunList(home, parsed.query);
agree("run.list", imported, await commandResult(["run", "list", "--json", "--home", home]), "${RUN}", "stdout");
`);
});

test("run.show compared live: `bot run show --json` and runShowReading agree byte for byte", async () => {
  await live(`${PREAMBLE}
import { runShowReading } from "bot/run-readings";

const imported = await runShowReading(home, "${RUN}", true, env);
agree("run.show", imported, await commandResult(["run", "show", "${RUN}", "--json", "--home", home]), "${RUN}", "stdout");
`);
});

test("run.record compared live: `bot run record --raw` and runRecordReading agree byte for byte", async () => {
  await live(`${PREAMBLE}
import { runRecordReading } from "bot/run-readings";

const imported = await runRecordReading(home, "${RUN}");
agree("run.record", imported, await commandResult(["run", "record", "${RUN}", "--raw", "--home", home]), "${RUN}", "stdout");
`);
});

test("capabilities compared live: `bot capabilities --json` and capabilitiesReading agree byte for byte", async () => {
  await live(`${PREAMBLE}
import { capabilitiesReading } from "bot/admin-readings";

const imported = await capabilitiesReading(true);
agree("capabilities", imported, await commandResult(["capabilities", "--json"]), "bot.capabilities", "stdout");
`);
});

test("home.show compared live: `bot home show --json` and homeShowReading agree byte for byte", async () => {
  await live(`${PREAMBLE}
import { homeShowReading } from "bot/admin-readings";

const imported = await homeShowReading(home, true, cwd);
agree("home.show", imported, await commandResult(["home", "show", "--home", home, "--json"]), home, "stdout");
`);
});

test("home.busy compared live: JSON mode agrees on an unlocked directory and quiet mode agrees on exit 1", async () => {
  await live(`${PREAMBLE}
import { homeBusyReading } from "bot/admin-readings";

const imported = await homeBusyReading(home, plain, { json: true }, cwd, env);
const commanded = await commandResult(["home", "busy", plain, "--home", home, "--json"]);
agree("home.busy", imported, commanded, "busy", "stdout");
for (const [side, bytes] of [["import", imported.stdout], ["command", commanded.stdout]]) {
  const busy = JSON.parse(Buffer.from(bytes).toString("utf8")).data.busy;
  if (busy !== false) throw new Error(\`the \${side} reported busy \${String(busy)} for an unlocked directory\`);
}

// Quiet mode writes no bytes at all, so exit 1 is the whole answer.
const quiet = await homeBusyReading(home, plain, { quiet: true }, cwd, env);
const quietCommanded = await commandResult(["home", "busy", plain, "--home", home, "--quiet"]);
if (quiet.exit !== 1 || quietCommanded.exit !== 1) {
  throw new Error(\`home.busy quiet exit differs: command \${quietCommanded.exit}, import \${quiet.exit}\`);
}
if (quiet.stdout.length !== 0 || quietCommanded.stdout.length !== 0) {
  throw new Error("home.busy quiet mode wrote bytes to standard output");
}
`);
});

test("assembly.check compared live: `bot assembly check --json` and assemblyCheckReading agree byte for byte", async () => {
  await live(`${PREAMBLE}
import { assemblyCheckReading } from "bot/admin-readings";

const imported = await assemblyCheckReading(home, "${TARGET}", undefined, { json: true }, cwd, env);
agree("assembly.check", imported,
  await commandResult(["assembly", "check", "${TARGET}", "--json", "--home", home]), "${TARGET}", "stdout");
`);
});

test("assembly.list compared live: `bot assembly list --json` and assemblyListReading agree byte for byte", async () => {
  await live(`${PREAMBLE}
import { assemblyListReading } from "bot/admin-readings";

const imported = await assemblyListReading(home, { json: true }, cwd, env);
agree("assembly.list", imported,
  await commandResult(["assembly", "list", "--json", "--home", home]), "${ASSEMBLY}", "stdout");
`);
});

test("run.check compared live: `bot run check --json` and runCheckReading agree byte for byte", async () => {
  await live(`${PREAMBLE}
import { runCheckReading } from "bot/run-readings";

const imported = await runCheckReading(home, "${RUN}", "gate", { json: true }, cwd, env);
agree("run.check", imported,
  await commandResult(["run", "check", "${RUN}", "gate", "--json", "--home", home]), "${RUN}", "stdout");
`);
});

test("run.checklist compared live: the marks agree, the run-missing refusal agrees, and a changed run name fails", async () => {
  await live(`${PREAMBLE}
import { runChecklistReading } from "bot/run-readings";

const imported = await runChecklistReading(home, "${RUN}", { json: true }, cwd, env);
const commanded = await commandResult(["run", "checklist", "${RUN}", "--json", "--home", home]);
agree("run.checklist", imported, commanded, "${RUN}", "stdout");

// The refusal: an unmatched run leaves stdout empty, so its marker is on stderr.
const missing = await runChecklistReading(home, "absent", { json: true }, cwd, env);
const missingCommanded = await commandResult(["run", "checklist", "absent", "--json", "--home", home]);
agree("run.checklist", missing, missingCommanded, "run-missing", "stderr");
if (missing.exit !== 1 || missing.stdout.length !== 0) {
  throw new Error(\`the run.checklist refusal exited \${missing.exit} with \${missing.stdout.length} bytes on stdout\`);
}

// Change the run name in the wrapper alone: the comparison must fail.
const mutated = await runChecklistReading(home, "absent", { json: true }, cwd, env);
let complaint;
try { agree("run.checklist", mutated, commanded, "${RUN}", "stdout"); } catch (reason) { complaint = reason; }
if (complaint === undefined) throw new Error("a changed wrapper run name did not fail the run.checklist comparison");
`);
});

test("run.events compared live: `bot run events --json` and runEventsReading agree byte for byte", async () => {
  await live(`${PREAMBLE}
import { runEventsReading } from "bot/run-readings";

const imported = await runEventsReading(home, "${RUN}", { json: true }, cwd, env);
agree("run.events", imported,
  await commandResult(["run", "events", "${RUN}", "--json", "--home", home]), "${RUN}", "stdout");
`);
});

test("run.output compared live: the sealed output agrees and the mismatch refusal agrees", async () => {
  await live(`${PREAMBLE}
import { writeFile } from "node:fs/promises";
import { runOutputReading } from "bot/run-readings";

const imported = await runOutputReading(home, "${RUN}", undefined, cwd, env);
agree("run.output", imported,
  await commandResult(["run", "output", "${RUN}", "--raw", "--home", home]), "${RUN}", "stdout");

// A changed output no longer matches its recorded hash: both sides refuse.
await writeFile(output, "a different answer for ${RUN}\\n");
const refused = await runOutputReading(home, "${RUN}", undefined, cwd, env);
const refusedCommanded = await commandResult(["run", "output", "${RUN}", "--raw", "--home", home]);
agree("run.output", refused, refusedCommanded, "${RUN}", "stderr");
if (refused.exit !== 1 || refused.stdout.length !== 0) {
  throw new Error(\`the run.output refusal exited \${refused.exit} with \${refused.stdout.length} bytes on stdout\`);
}
`);
});

test("run.request compared live: `bot run request --raw` and runRequestReading agree byte for byte", async () => {
  await live(`${PREAMBLE}
import { runRequestReading } from "bot/run-readings";

const imported = await runRequestReading(home, "${RUN}", cwd, env);
agree("run.request", imported,
  await commandResult(["run", "request", "${RUN}", "--raw", "--home", home]), "${RUN}", "stdout");
`);
});

test("intelligence.list compared live: `bot intelligence list --json` and intelligenceListReading agree byte for byte", async () => {
  await live(`${PREAMBLE}
import { intelligenceListReading } from "bot/admin-readings";

const imported = await intelligenceListReading(home, true, cwd, env);
agree("intelligence.list", imported,
  await commandResult(["intelligence", "list", "--json", "--home", home]), "bot.intelligence.list", "stdout");
`);
});
