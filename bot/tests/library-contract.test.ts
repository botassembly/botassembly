// Ticket 0289 opened this suite with one operation, `run.session`, compared
// live against its importable counterpart. Ticket 0291 added `run.list`,
// `run.show`, and `run.record`. Every other operation sits in exactly one of
// two checked in allowlists until the export tickets shrink them.
//
// The map is the trigger for both allowlist directions (`bot/package.json`'s
// export paths carry no operation names): an operation absent from the map
// and from both lists fails, and an operation named in the map and in an
// allowlist also fails, so a landed export forces its stale allowlist entry
// out. `operationFault` below is the one function that states that rule, and
// the "stale" and "missing" tests exercise it directly against mutated
// copies, the same way the ticket's acceptance section demonstrates red.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
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
const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

// Sixteen operations carry `mutates: false` (ticket "Current facts"). Four of
// them are compared live below. The other twelve have no importable
// counterpart yet.
const PENDING_EXPORT: readonly NewOperation[] = [
  "assembly.check", "assembly.list", "auth.list", "capabilities", "home.busy", "home.show", "model.list",
  "run.check", "run.checklist", "run.events", "run.output", "run.request",
];

// The nine operations that mutate the Bot home or the credential store. The
// next ticket admits them under ruling 1 (2026-09-14): `run.start` and
// `run.resume` start the run in a child process; every other admitted
// mutation still runs in the importer's process.
const PENDING_MUTATION: readonly NewOperation[] = [
  "assembly.install", "assembly.link", "assembly.remove", "assembly.update",
  "auth.import", "auth.login", "auth.logout", "run.start", "run.resume",
];

// Each entry names the function the command itself calls. `run-session-command.ts:124`
// calls `inspectSession` (`one-run.ts:413`); `run-list-command.ts:38` calls
// `inspectRunList`; `run-show-command.ts:22` and `runShowReading` both call
// `readRunShow`; `run-record-command.ts:54` and `runRecordReading` both call
// `inspectRawShow`.
const COUNTERPARTS: Readonly<Partial<Record<NewOperation, string>>> = {
  "run.session": "inspectSession (bot/one-run)",
  "run.list": "inspectRunList (bot/run-readings)",
  "run.show": "runShowReading (bot/run-readings)",
  "run.record": "runRecordReading (bot/run-readings)",
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

// Red demonstration 1: a 26th operation named in neither list nor the map.
test("an operation added to CLI_CONTRACTS with no export or allowlist entry fails naming it", () => {
  const operations = [...CLI_CONTRACTS.map((descriptor) => descriptor.operation), "assembly.retire"];
  expect(operationFault(operations, PENDING_EXPORT, PENDING_MUTATION, COUNTERPARTS))
    .toBe("assembly.retire has no importable counterpart and sits in no allowlist");
});

// Red demonstration 2, one mutated copy per exported operation because
// `operationFault` returns on the first offender. Dropping one export without
// returning its name to an allowlist fails naming exactly that operation.
for (const operation of ["run.list", "run.show", "run.record"]) {
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
  const stale = { ...COUNTERPARTS, "run.output": "selectOutput (bot/run-output)" };
  expect(operationFault(operations, [...PENDING_EXPORT], PENDING_MUTATION, stale))
    .toBe("run.output sits in the counterpart map and in an allowlist");
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
// the consumer's own process, then requires the same bytes and the fixture's
// own run name inside them.
const PREAMBLE = `
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const runChild = promisify(execFile);
const [home, cli] = process.argv.slice(2);

async function commandBytes(args) {
  const done = await runChild(process.execPath, [cli, ...args, "--home", home],
    { env: { ...process.env }, encoding: "buffer", maxBuffer: 16 * 1024 * 1024 });
  return Buffer.from(done.stdout);
}

function agree(operation, imported, commanded) {
  if (!imported.equals(commanded)) {
    throw new Error(\`\${operation} bytes differ: command \${commanded.length} bytes, import \${imported.length} bytes\`);
  }
  if (!commanded.toString("utf8").includes("${RUN}")) {
    throw new Error(\`the compared \${operation} bytes did not carry the fixture run name\`);
  }
}
`;

async function fixture(consumer: string): Promise<{ home: string; file: string }> {
  const root = await mkdtemp(join(tmpdir(), "bot-library-contract-"));
  roots.push(root);
  const home = join(root, "home");
  const directory = join(home, "runs", RUN);
  await mkdir(join(directory, dirname(SESSION)), { recursive: true });
  await writeFile(join(directory, "record.jsonl"), currentRecord([
    { record: 1, event: "run_start", run: RUN, assembly: "reader", flow: "main", ts: "2026-09-14T09:00:00.000Z" },
    { event: "stage_start", stage: STAGE, retry: 1, session: SESSION, ts: "2026-09-14T09:00:01.000Z" },
    { event: "stage_end", stage: STAGE, retry: 1, exit: 0, cause: "success", ts: "2026-09-14T09:00:02.000Z" },
    { event: "run_end", exit: 0, cause: "success", ts: "2026-09-14T09:00:03.000Z" },
  ]));
  await writeFile(join(directory, SESSION), transcript);
  await mkdir(join(root, "node_modules"));
  await symlink(join(import.meta.dirname, ".."), join(root, "node_modules", "bot"), "dir");
  const file = join(root, "consumer.mjs");
  await writeFile(file, consumer);
  return { home, file };
}

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

test("run.session compared live: `bot run session --raw` and inspectSession(raw=true) agree byte for byte", async () => {
  const held = await fixture(`
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
  await run(process.execPath, [held.file, held.home, CLI], { encoding: "utf8" });
});

test("run.list compared live: `bot run list --json` and inspectRunList agree byte for byte", async () => {
  const held = await fixture(`${PREAMBLE}
import { inspectRunList, parseRunList } from "bot/run-readings";

const parsed = parseRunList(["--json"]);
if (!("query" in parsed)) throw new Error("the run list parse refused --json");
const imported = await inspectRunList(home, parsed.query);
agree("run.list", imported.stdout, await commandBytes(["run", "list", "--json"]));
`);
  await run(process.execPath, [held.file, held.home, CLI], { encoding: "utf8" });
});

test("run.show compared live: `bot run show --json` and runShowReading agree byte for byte", async () => {
  const held = await fixture(`${PREAMBLE}
import { runShowReading } from "bot/run-readings";

const imported = await runShowReading(home, "${RUN}", true, { ...process.env });
agree("run.show", imported.stdout, await commandBytes(["run", "show", "${RUN}", "--json"]));
`);
  await run(process.execPath, [held.file, held.home, CLI], { encoding: "utf8" });
});

test("run.record compared live: `bot run record --raw` and runRecordReading agree byte for byte", async () => {
  const held = await fixture(`${PREAMBLE}
import { runRecordReading } from "bot/run-readings";

const imported = await runRecordReading(home, "${RUN}");
agree("run.record", imported.stdout, await commandBytes(["run", "record", "${RUN}", "--raw"]));
`);
  await run(process.execPath, [held.file, held.home, CLI], { encoding: "utf8" });
});
