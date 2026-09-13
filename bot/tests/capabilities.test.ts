import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { main, type CliBoundary } from "../src/cli.ts";
import { CLI_CONTRACTS, NEW_COMMAND_ERROR_BYTES, descriptorFault, type CliDescriptor } from "../src/cli-contract.ts";
import { capabilitiesCommand, capabilitiesResult } from "../src/capabilities.ts";
import { mapping } from "../src/model.ts";
import { runStartEvent, type RuntimeProvenance } from "../src/record-events.ts";
import { RUN_LIST_CONTRACT } from "../src/run-list-query.ts";
import { resolveRuntimeProvenance, type RuntimeSourceIdentityResolution } from "../src/runtime-provenance.ts";
import { createModels } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";

interface Invocation { code: number; out: string; err: string }

function object(text: string): Record<string, unknown> {
  const held: unknown = JSON.parse(text);
  if (!mapping(held)) throw new Error("Expected an object.");
  return held;
}

function boundary(): { value: CliBoundary; out: Buffer[]; err: Buffer[] } {
  const out: Buffer[] = [], err: Buffer[] = [];
  const value: CliBoundary = {
    cwd: "/definitely/absent", env: { BOT_HOME: "/definitely/absent/home" }, stdinIsTTY: true, stderrIsTTY: false,
    readStdin: () => Promise.resolve(Buffer.alloc(0)), stdout: (bytes) => { out.push(Buffer.from(bytes)); },
    stderr: (bytes) => { err.push(Buffer.from(bytes)); },
    clock: {
      milliseconds: () => 0, timestamp: () => "2026-09-05T12:00:00.000Z",
      setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
      clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
    },
    models: { getAvailable: () => { throw new Error("capabilities contacted a provider"); } } as never,
    modelRuntime: () => Promise.resolve(createModels()),
  };
  value.authListRuntime = () => Promise.resolve({
    runtime: { getProviders: () => [], getProviderAuthStatus: () => ({ configured: false }) } as unknown as ModelRuntime,
    credentials: [],
  });
  return {
    out, err, value,
  };
}

async function invoke(args: string[]): Promise<Invocation> {
  const held = boundary();
  const code = await main(args, held.value);
  return { code, out: Buffer.concat(held.out).toString(), err: Buffer.concat(held.err).toString() };
}

function start(provenance: RuntimeProvenance) {
  return runStartEvent({
    ts: "2026-09-05T12:00:00.000Z", run: "run", assembly: "review", assemblyHash: "a".repeat(64),
    installationId: "11111111-1111-4111-8111-111111111111", request: { path: "request.txt", sha256: "a".repeat(64), bytes: 0, via: "argument" },
    provenance,
  });
}

async function invokeCapabilities(args: string[], resolve: () => Promise<RuntimeSourceIdentityResolution>): Promise<Invocation> {
  const held = boundary();
  const code = await capabilitiesCommand(args, held.value, resolve);
  return { code, out: Buffer.concat(held.out).toString(), err: Buffer.concat(held.err).toString() };
}

function expectOption(help: string, option: CliDescriptor["options"][number]): void {
  expect(help).toContain(option.name);
  for (const alias of option.aliases) expect(help).toContain(alias);
  for (const value of option.values ?? []) expect(help).toContain(value);
  if (option.default !== undefined) expect(help).toContain(`default ${String(option.default)}`);
  if (option.minimum !== undefined) expect(help).toContain(`minimum ${String(option.minimum)}`);
  if (option.maximum !== undefined) expect(help).toContain(`maximum ${String(option.maximum)}`);
  if (option.bytes !== undefined) expect(help).toContain(`at most ${option.bytes.toLocaleString("en-US")} bytes`);
  if (option.required === true) expect(help).toContain("required");
}

test("capabilities reports only the compiled implemented command surfaces", async () => {
  const human = await invoke(["capabilities"]), json = await invoke(["capabilities", "-j"]);
  expect(human.code, human.err).toBe(0);
  expect(Buffer.byteLength(human.out)).toBeLessThanOrEqual(65_536);
  expect(human.out).toContain("| capabilities |");
  expect(human.out).toContain("| run.list |");
  for (const absent of ["| runs |", "| show |"]) expect(human.out).not.toContain(absent);
  const document = object(json.out);
  expect(document).toMatchObject({ schemaVersion: 1, kind: "bot.capabilities" });
  expect(Buffer.byteLength(json.out)).toBeLessThanOrEqual(65_536);
  expect(json.out.endsWith("\n")).toBe(true);
  expect(json.err).toBe("");
  expect(await invoke(["capabilities", "--json"])).toEqual(json);
  const data = document["data"];
  expect(mapping(data) && Array.isArray(data["commands"]) ? data["commands"] : []).toEqual(CLI_CONTRACTS);
  for (const held of CLI_CONTRACTS) {
    expect(held.options.map((option) => option.name)).toEqual([...held.options].map((option) => option.name).sort());
  }
});

test("capabilities reports the same source identity as a fresh run start", async () => {
  const resolved = await resolveRuntimeProvenance();
  if (resolved.status !== "resolved") throw new Error(resolved.reason);
  const event = start(resolved.provenance);
  const json = object((await invoke(["capabilities", "-j"])).out);
  const data = json["data"];
  expect(data).toMatchObject({
    runtime: event.runtime,
    runtimeSource: event.runtime_source,
    runtimeDigest: event.runtime_digest,
    runtimeTreeSha256: event.runtime_tree_sha256,
  });
  expect(mapping(data) && Array.isArray(data["commands"]) ? data["commands"] : []).toEqual(CLI_CONTRACTS);

  const human = await invoke(["capabilities"]);
  expect(human.out.split("\n").slice(0, 3)).toEqual([
    "# Bot capabilities",
    `Runtime: ${event.runtime}; source: ${String(event.runtime_source)}; digest: ${String(event.runtime_digest)}; source tree SHA-256: ${String(event.runtime_tree_sha256)}`,
    "",
  ]);
});

test("capabilities renders unknown Git identity and fails closed when source identity is unavailable", async () => {
  const unknown: RuntimeProvenance = {
    runtimeSource: "unknown", runtimeDigest: null, runtimeTreeSha256: "b".repeat(64),
    lockSha256: "c".repeat(64), node: process.version, providerAdapter: "fixture@1",
  };
  const json = object((await invokeCapabilities(["-j"], () => Promise.resolve({ status: "resolved", identity: unknown }))).out);
  expect(json["data"]).toMatchObject({ runtimeSource: "unknown", runtimeDigest: null, runtimeTreeSha256: "b".repeat(64) });
  const human = await invokeCapabilities([], () => Promise.resolve({ status: "resolved", identity: unknown }));
  expect(human.out).toContain(`Runtime: ${start(unknown).runtime}; source: unknown; digest: -; source tree SHA-256: ${"b".repeat(64)}`);

  const failed = await invokeCapabilities(["-j"], () => Promise.resolve({ status: "failed", reason: "source changed" }));
  expect(failed).toMatchObject({ code: 4, out: "" });
  expect(object(failed.err)).toMatchObject({
    error: { code: "dependency-failed", operation: "capabilities", cause: "runtime-identity-unavailable", retryable: true },
  });
});

test("capability identity leaves the unsupported version request unchanged", async () => {
  const before = await invoke(["--version"]);
  await invoke(["capabilities", "-j"]);
  expect(await invoke(["--version"])).toEqual(before);
  expect(before).toMatchObject({ code: 2, out: "" });
});

test("the specification publications describe the source identity boundary", () => {
  const documents = new Map([
    ["../../specification/elements/inspection.md", ["`runtimeSource`", "`runtimeTreeSha256`", "`runtime-identity-unavailable`"]],
    ["../../specification/conformance.md", ["source-tree hash", "null Git digest", "unchanged `bot --version` failure"]],
  ]);
  for (const [file, facts] of documents) {
    const text = readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");
    for (const fact of facts) expect(text, `${file}: ${fact}`).toContain(fact);
  }
});

test("Markdown capabilities report every command-wide bound", async () => {
  const human = await invoke(["capabilities"]);
  expect(human.code, human.err).toBe(0);
  for (const held of CLI_CONTRACTS) {
    for (const [name, value] of Object.entries(held.limits)) {
      expect(human.out).toContain(`| ${held.operation} | ${name} | ${String(value)} |`);
    }
  }
});

test("run list capabilities reuse the parser's closed values and limits", () => {
  const held = CLI_CONTRACTS.find((descriptor) => descriptor.operation === "run.list");
  expect(held).toBeDefined();
  const options = Object.fromEntries((held?.options ?? []).map((option) => [option.name, option]));
  expect(options["--fields"]?.values).toEqual(RUN_LIST_CONTRACT.fields);
  expect(options["--state"]?.values).toEqual(RUN_LIST_CONTRACT.states);
  expect(options["--cause"]?.values).toEqual(RUN_LIST_CONTRACT.causes);
  expect(options["--limit"]).toMatchObject({ default: RUN_LIST_CONTRACT.page.default, minimum: 1, maximum: RUN_LIST_CONTRACT.page.maximum });
  expect(options["--after"]?.bytes).toBe(RUN_LIST_CONTRACT.cursor.encodedBytes);
  expect(held?.limits).toEqual({
    cursorDecodedBytes: RUN_LIST_CONTRACT.cursor.decodedBytes,
    cursorEncodedBytes: RUN_LIST_CONTRACT.cursor.encodedBytes,
    filterBytes: RUN_LIST_CONTRACT.filters.bytes,
    filterValues: RUN_LIST_CONTRACT.filters.values,
    humanErrorBytes: NEW_COMMAND_ERROR_BYTES,
    markdownCellBytes: RUN_LIST_CONTRACT.output.cellBytes,
    markdownPageBytesExclusive: RUN_LIST_CONTRACT.output.pageBytesExclusive,
    markdownRowBytes: RUN_LIST_CONTRACT.output.rowBytes,
    pageDefault: RUN_LIST_CONTRACT.page.default,
    pageMaximum: RUN_LIST_CONTRACT.page.maximum,
    summaryTextBytes: RUN_LIST_CONTRACT.output.summaryTextBytes,
    warningCount: RUN_LIST_CONTRACT.warnings.count,
    warningDiagnosticBytes: RUN_LIST_CONTRACT.warnings.diagnosticBytes,
    warningLineBytes: RUN_LIST_CONTRACT.warnings.lineBytes,
  });
});

test("run show capability publishes the bounded read-only contract", () => {
  const held = CLI_CONTRACTS.find((descriptor) => descriptor.operation === "run.show");
  expect(held).toMatchObject({ command: ["run", "show"], output: { kind: "bot.run.show", schemaVersion: 1 }, modes: ["markdown", "json"], home: "reads", mutates: false, network: "never" });
  expect(held?.options).toEqual([
    { name: "--home", aliases: [], type: "path", repeatable: false, default: "BOT_HOME, then platform default" },
    { name: "--json", aliases: ["-j"], type: "boolean", repeatable: false },
  ]);
  expect(held?.limits).toMatchObject({ documentBytesExclusive: 1_048_576, markdownCellBytes: 480, markdownRowBytes: 4_096, rows: 1_000, sourceTextBytes: 4_096, warnings: 20 });
});

test("every advertised command dispatches and owns descriptor-generated help", async () => {
  for (const held of CLI_CONTRACTS) {
    const help = await invoke([...held.command, "--help"]);
    expect(help.code, help.err).toBe(0);
    expect(help.out).toContain(`usage: bot ${held.command.join(" ")}`);
    expect(help.out).toContain(`Modes: ${held.modes.join(", ")}.`);
    expect(help.out).toContain(`Network: ${held.network}. Home: ${held.home}.`);
    const optionNames = help.out.split("\n").filter((line) => line.startsWith("  --"))
      .map((line) => line.trimStart().split(/[ ,]/u)[0]);
    const allOptions = [...held.options, ...(held.dynamicOptions ?? [])];
    expect(optionNames).toEqual(allOptions.map((option) => option.name));
    for (const option of allOptions) expectOption(help.out, option);
    const machineReadable = ["auth.list", "run.list"].includes(held.operation);
    const dispatched = await invoke([...held.command, ...(machineReadable ? ["-j"] : [])]);
    expect(dispatched.code, held.operation).toBe(["auth.list", "capabilities", "model.list"].includes(held.operation) ? 0
      : ["assembly.list", "run.list"].includes(held.operation) ? 1 : held.operation === "assembly.update" ? 4 : 2);
    if (held.operation === "run.list") expect(object(dispatched.err)).toMatchObject({ error: { operation: held.operation } });
  }
  const overview = await invoke(["--help"]);
  expect(overview.out).toContain("  capabilities ");
  expect(overview.out).toContain("  run list ");
  expect(overview.out).toContain("  run start ");
});

test("the advertised no-argument auth list command settles through its real fixture", async () => {
  expect(CLI_CONTRACTS.some((held) => held.operation === "auth.list" && held.command.join(" ") === "auth list")).toBe(true);
  const settled = await invoke(["auth", "list", "-j"]);
  expect(settled).toMatchObject({ code: 0, err: "" });
  expect(object(settled.out)).toMatchObject({
    schemaVersion: 1, kind: "bot.auth.list", data: [], summary: { total: 0, returned: 0 },
  });
});

test("malformed capability requests fail before home and provider access", async () => {
  for (const args of [["--home", "/"], ["--unknown"], ["--json", "--json"], ["--json", "-j"]]) {
    const held = await invoke(["capabilities", ...args]);
    expect(held.code).toBe(2);
    expect(held.out).toBe("");
    if (args.includes("--json") || args.includes("-j")) {
      expect(object(held.err)).toMatchObject({ error: { code: "request-invalid", operation: "capabilities" } });
    } else {
      expect(held.err.split("\n")).toHaveLength(2);
      expect(Buffer.byteLength(held.err)).toBeLessThanOrEqual(2_049);
    }
  }
});

test("descriptor integrity rejects collisions, unknown network behavior, and oversized output", () => {
  const first = CLI_CONTRACTS[0];
  if (first === undefined) throw new Error("Expected descriptors.");
  const firstOption = first.options[0];
  if (firstOption === undefined) throw new Error("Expected a capability option.");
  const duplicateOperation = [...CLI_CONTRACTS, { ...first, command: ["different"] }];
  const duplicatePath = [...CLI_CONTRACTS, { ...first, operation: "different" }] as unknown as CliDescriptor[];
  const duplicateOption = [{ ...first, options: [...first.options, firstOption] }, ...CLI_CONTRACTS.slice(1)];
  const unknownNetwork = [{ ...first, network: "sometimes" }, ...CLI_CONTRACTS.slice(1)] as unknown as CliDescriptor[];
  const falseRequired = [{ ...first, options: [{ ...firstOption, required: false }] }, ...CLI_CONTRACTS.slice(1)] as unknown as CliDescriptor[];
  for (const fixture of [duplicateOperation, duplicatePath, duplicateOption, unknownNetwork, falseRequired]) expect(descriptorFault(fixture)).toBeDefined();
  expect(descriptorFault(CLI_CONTRACTS.slice(1))).toBe("operation inventory mismatch");
  const oversized = CLI_CONTRACTS.map((held) => held.operation === "capabilities"
    ? { ...held, options: [{ ...firstOption, aliases: ["x".repeat(66_000)] }] } : held);
  const identity = { runtimeSource: "checkout" as const, runtimeDigest: "a".repeat(40), runtimeTreeSha256: "b".repeat(64) };
  expect(capabilitiesResult(oversized, true, identity).exit).toBe(5);
  expect(capabilitiesResult(oversized, false, identity).exit).toBe(5);
});

test("capabilities leaves representative legacy and run-list bytes unchanged", async () => {
  for (const args of [["run", "start", "--help"], ["run", "list", "--help"], ["run", "list", "--help"]]) {
    const before = await invoke(args);
    await invoke(["capabilities", "-j"]);
    expect(await invoke(args)).toEqual(before);
  }
});
