import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, open, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";
import { CLI_CONTRACTS, type NewOperation } from "../src/cli-contract.ts";
import { PI_CAPABLE_OPERATIONS } from "../src/new-command-dispatch.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "../src/cli.ts");
const RECORDER = pathToFileURL(join(HERE, "support/module-load-recorder.mjs")).href;
const PI_PACKAGE = "@earendil-works";

interface ChildResult { exit: number; loaded: readonly string[]; stderr: string; stdout: string }

async function invoke(args: readonly string[], root: string, agentDir: string): Promise<ChildResult> {
  const identity = randomUUID(), record = join(root, `${identity}.modules.json`);
  const stdoutPath = join(root, `${identity}.stdout`), stderrPath = join(root, `${identity}.stderr`);
  const env = {
    HOME: root,
    PATH: process.env["PATH"],
    PI_CODING_AGENT_DIR: agentDir,
    BOT_MODULE_LOAD_RECORD: record,
    NODE_OPTIONS: `--import=${RECORDER}`,
  };
  const stdout = await open(stdoutPath, "w"), stderr = await open(stderrPath, "w");
  const child = spawn(process.execPath, [CLI, ...args], { cwd: root, env, stdio: ["ignore", stdout.fd, stderr.fd] });
  const exit = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === null) reject(new Error(`Bot child stopped with ${signal ?? "an unknown signal"}.`));
      else resolve(code);
    });
  });
  await Promise.all([stdout.close(), stderr.close()]);
  return {
    exit,
    loaded: JSON.parse(await readFile(record, "utf8")) as string[],
    stdout: await readFile(stdoutPath, "utf8"),
    stderr: await readFile(stderrPath, "utf8"),
  };
}

async function fixture(root: string): Promise<{ agentDir: string; home: string; source: string }> {
  const agentDir = join(root, "agent"), home = join(root, "home"), source = join(root, "source");
  await Promise.all([
    mkdir(agentDir, { mode: 0o700 }),
    mkdir(join(home, "assemblies"), { recursive: true, mode: 0o700 }),
    mkdir(join(home, "runs"), { recursive: true, mode: 0o700 }),
    mkdir(join(source, "flows", "main"), { recursive: true, mode: 0o700 }),
  ]);
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n"),
    writeFile(join(source, "ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(source, "flows", "main", "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(source, "flows", "main", "01-work.md"), "---\n---\nWork.\n"),
  ]);
  return { agentDir, home, source };
}

interface PiFreeCase {
  operation: NewOperation | "help" | "version";
  args: string[];
  exit: number;
  channel?: "stdout" | "stderr";
  contains?: string;
}

describe("lazy Pi command boundary", () => {
  test("the closed Pi-capable table and command inventory are exact complements", () => {
    const inventory = CLI_CONTRACTS.map(({ operation }) => operation);
    const pi = new Set<NewOperation>(PI_CAPABLE_OPERATIONS);
    const piFree = inventory.filter((operation) => !pi.has(operation));
    expect(pi.size).toBe(PI_CAPABLE_OPERATIONS.length);
    expect(inventory.filter((operation) => pi.has(operation))).toEqual([...PI_CAPABLE_OPERATIONS]);
    expect(new Set<NewOperation>([...PI_CAPABLE_OPERATIONS, ...piFree])).toEqual(new Set(inventory));
    expect(PI_CAPABLE_OPERATIONS.length + piFree.length).toBe(inventory.length);
  });

  // D4 (ticket 0287): the fragment this test asserted per command is dropped
  // wherever another file already owns it (same operation, an exit code and
  // a content proof, through the real CLI or `main`). Owners, by operation:
  //   assembly.check/install/link/list/update/remove — cli-assembly-management.test.ts
  //   capabilities — capabilities.test.ts
  //   home.busy — home-busy.test.ts
  //   home.show — home-installation.test.ts:50
  //   run.events — run-events.test.ts:150
  //   run.list — run-list.test.ts:90
  //   run.show — run-show.test.ts:242
  //   help — cli-help.test.ts:81
  // run.check and run.checklist keep their fragment: no other file asserts
  // `"operation":"run.check","cause":"run-missing"` or the checklist
  // equivalent for a genuinely absent run (as opposed to a missing record or
  // an absent check name, which is what run-check.test.ts otherwise proves).
  // `--version`'s `request-invalid` line has no other owner either. Nor does
  // "No run's name starts with absent." for run.output, run.record,
  // run.request, or run.session — run-output.test.ts:54 checks only exit 1
  // and empty stdout, run-record.test.ts checks a malformed-arg exit 2 and a
  // missing record (not an absent run), run-request.test.ts checks only
  // `err.length > 0`, and run-session.test.ts has no absent-run case — so
  // those four keep their fragment too.
  // The unique proof here — the Pi-free inventory loads no Earendil module —
  // is unaffected; every case keeps its exit code and module-list assertion.
  test("every Pi-free command plus help and version loads no Earendil module", async () => {
    const root = await mkdtemp(join(tmpdir(), "bot-lazy-runtime-"));
    const { agentDir, home, source } = await fixture(root);
    const pi = new Set<NewOperation>(PI_CAPABLE_OPERATIONS);
    const cases: PiFreeCase[] = [
      { operation: "assembly.check", args: ["assembly", "check", `${source}/main`, "--home", home, "--json"], exit: 0 },
      { operation: "assembly.install", args: ["assembly", "install", source, "--name", "installed", "--home", home, "--json"], exit: 0 },
      { operation: "assembly.link", args: ["assembly", "link", source, "--name", "linked", "--home", home, "--json"], exit: 0 },
      { operation: "assembly.list", args: ["assembly", "list", "--home", home, "--json"], exit: 0 },
      { operation: "assembly.update", args: ["assembly", "update", "installed", "--home", home, "--json"], exit: 0 },
      { operation: "assembly.remove", args: ["assembly", "remove", "linked", "--home", home, "--json"], exit: 0 },
      { operation: "capabilities", args: ["capabilities", "--json"], exit: 0 },
      { operation: "home.busy", args: ["home", "busy", root, "--home", home, "--json"], exit: 0 },
      { operation: "home.show", args: ["home", "show", "--home", home, "--json"], exit: 0 },
      { operation: "intelligence.list", args: ["intelligence", "list", "--home", home, "--json"], exit: 0 },
      { operation: "run.check", args: ["run", "check", "absent", "gate", "--home", home, "--json"], exit: 1, channel: "stderr", contains: '"operation":"run.check","cause":"run-missing"' },
      { operation: "run.checklist", args: ["run", "checklist", "absent", "--home", home, "--json"], exit: 1, channel: "stderr", contains: '"operation":"run.checklist","cause":"run-missing"' },
      { operation: "run.events", args: ["run", "events", "absent", "--home", home, "--json"], exit: 1 },
      { operation: "run.list", args: ["run", "list", "--home", home, "--json"], exit: 0 },
      { operation: "run.output", args: ["run", "output", "absent", "--raw", "--home", home], exit: 1, channel: "stderr", contains: "No run's name starts with absent." },
      { operation: "run.record", args: ["run", "record", "absent", "--raw", "--home", home], exit: 1, channel: "stderr", contains: "No run's name starts with absent." },
      { operation: "run.request", args: ["run", "request", "absent", "--raw", "--home", home], exit: 1, channel: "stderr", contains: "No run's name starts with absent." },
      { operation: "run.session", args: ["run", "session", "absent", "stage", "--home", home], exit: 1, channel: "stderr", contains: "No run's name starts with absent." },
      { operation: "run.show", args: ["run", "show", "absent", "--home", home, "--json"], exit: 1 },
      { operation: "help", args: ["--help"], exit: 0 },
      { operation: "version", args: ["--version"], exit: 2, channel: "stderr", contains: "request-invalid  --version" },
    ];
    expect(new Set(cases.filter(({ operation }) => operation !== "help" && operation !== "version").map(({ operation }) => operation)))
      .toEqual(new Set(CLI_CONTRACTS.filter(({ operation }) => !pi.has(operation)).map(({ operation }) => operation)));

    // Sequential, not parallel (ticket 0287 review): assembly.list reads
    // home/assemblies while assembly.install/update/link/remove write it, so
    // any concurrent form — even a bounded pool — narrows that race rather
    // than closing it, and a burst of cold `node` children raises this
    // machine's peak load, against the ticket's own goal. Only the fragment
    // trim above stands; the twenty-one invocations keep running one at a time.
    for (const held of cases) {
      const result = await invoke(held.args, root, agentDir);
      expect(result.exit, held.operation).toBe(held.exit);
      if (held.contains !== undefined) expect(result[held.channel ?? "stdout"], held.operation).toContain(held.contains);
      expect(result.loaded.filter((specifier) => specifier.includes(PI_PACKAGE)), held.operation).toEqual([]);
    }
  }, 60_000);

  test("model listing constructs the real Pi runtime after dispatch", async () => {
    const root = await mkdtemp(join(tmpdir(), "bot-lazy-model-"));
    const agentDir = join(root, "agent");
    await mkdir(agentDir, { mode: 0o700 });
    await chmod(agentDir, 0o700);
    const result = await invoke(["model", "list", "--json"], root, agentDir);
    expect(result.exit).toBe(0);
    expect(result.loaded.some((specifier) => specifier.includes("/@earendil-works/pi-coding-agent/"))).toBe(true);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({ kind: "bot.model.list", schemaVersion: 1 });
  }, 30_000);

  test("authentication import resolves Pi's agent directory before refusing a missing source", async () => {
    const root = await mkdtemp(join(tmpdir(), "bot-lazy-auth-import-"));
    const agentDir = join(root, "agent");
    await mkdir(agentDir, { mode: 0o700 });
    const missing = join(root, "missing.json");
    const result = await invoke(["auth", "import", missing, "--json"], root, agentDir);
    expect(result.exit).toBe(2);
    expect(result.loaded.some((specifier) => specifier.includes("/@earendil-works/pi-coding-agent/"))).toBe(true);
    expect(JSON.parse(result.stderr)).toMatchObject({ kind: "error", error: { cause: "source-missing" } });
  }, 30_000);
});
