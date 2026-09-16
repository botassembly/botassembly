import { expect, test } from "vitest";
import { CLI_CONTRACTS } from "../src/cli-contract.ts";
import { decodeDocument, structuredContract, structuredRegistryFault, STRUCTURED_COMMANDS, type StructuredContract } from "../src/command-document.ts";
import { RETIRED_CREDENTIAL_ADVISORY } from "../src/credential-advisory.ts";
import type { CommandResult } from "../src/new-command-result.ts";

const line = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value)}\n`);
const result = (exit: number, stdout: Buffer = Buffer.alloc(0), stderr: Buffer = Buffer.alloc(0)): CommandResult<number> => ({ exit, stdout, stderr });
const success = (kind: string): Buffer => line({ schemaVersion: 1, kind, data: {} });
const refusal = (operation: string, cause = "argument-invalid"): Buffer => line({ schemaVersion: 1, kind: "error", error: {
  code: "request-invalid", operation, cause, message: "refused", retryable: false, details: {},
} });

test("the registry covers every structured public counterpart exactly once", () => {
  expect(structuredRegistryFault(STRUCTURED_COMMANDS, CLI_CONTRACTS)).toBeUndefined();
  expect(STRUCTURED_COMMANDS).toHaveLength(21);
  expect(STRUCTURED_COMMANDS.filter((entry) => entry.framing === "authentication-interaction").map((entry) => entry.operation)).toEqual(["auth.login"]);
  expect(STRUCTURED_COMMANDS.filter((entry) => entry.framing === "authentication-advisory").map((entry) => entry.operation)).toEqual(["auth.logout"]);
});

test("registry drift identifies omissions, duplicates, raw operations, identity changes, and framing changes", () => {
  expect(structuredRegistryFault(STRUCTURED_COMMANDS.filter((entry) => entry.operation !== "run.show"), CLI_CONTRACTS)).toBe("run.show lacks one typed document");
  expect(structuredRegistryFault([...STRUCTURED_COMMANDS, STRUCTURED_COMMANDS[0] as StructuredContract], CLI_CONTRACTS)).toBe("duplicate structured operation");
  expect(structuredRegistryFault([...STRUCTURED_COMMANDS, { ...STRUCTURED_COMMANDS[0] as StructuredContract, operation: "run.output" }], CLI_CONTRACTS)).toBe("run.output must not have a typed document");
  expect(structuredRegistryFault(STRUCTURED_COMMANDS.map((entry) => entry.operation === "run.show" ? { ...entry, kind: "bot.run.wrong" } : entry), CLI_CONTRACTS)).toBe("run.show has the wrong kind");
  expect(structuredRegistryFault(STRUCTURED_COMMANDS.map((entry) => entry.operation === "auth.login" ? { ...entry, framing: "exclusive-json" } : entry), CLI_CONTRACTS)).toBe("auth.login has the wrong framing");
  for (const [field, value] of [
    ["reading", "wrongReading"], ["typed", "wrongDocument"], ["resultBytes", 17], ["exclusive", false],
    ["framing", "authentication-advisory"],
  ] as const) {
    const changed = STRUCTURED_COMMANDS.map((entry) => entry.operation === "run.show" ? { ...entry, [field]: value } : entry);
    expect(structuredRegistryFault(changed, CLI_CONTRACTS), field).toBe(`run.show has the wrong ${field}`);
  }
});

test("registry bounds and strictness come from their owning command descriptors", () => {
  for (const [operation, limit] of [
    ["run.show", "documentBytesExclusive"],
    ["auth.login", "resultBytes"],
    ["run.start", "resultBytes"],
  ] as const) {
    const changed = CLI_CONTRACTS.map((descriptor) => descriptor.operation === operation
      ? { ...descriptor, limits: { ...descriptor.limits, [limit]: 17 } }
      : descriptor);
    expect(structuredRegistryFault(STRUCTURED_COMMANDS, changed), operation).toBe(`${operation} has the wrong resultBytes`);
  }
});

test("home busy owns an inclusive 65-byte document bound in its descriptor", () => {
  const contract = structuredContract("home.busy");
  expect(contract).toMatchObject({ resultBytes: 65, exclusive: false });
  const descriptor = CLI_CONTRACTS.find((held) => held.operation === "home.busy");
  expect(descriptor?.limits).toMatchObject({ documentBytes: 65 });
  for (const documentBytes of [undefined, 64, 66]) {
    const changed = CLI_CONTRACTS.map((held) => held.operation === "home.busy"
      ? { ...held, limits: documentBytes === undefined ? { humanErrorBytes: 2_048 } : { ...held.limits, documentBytes } }
      : held);
    expect(structuredRegistryFault(STRUCTURED_COMMANDS, changed), String(documentBytes)).toBe("home.busy has the wrong resultBytes");
  }
  const exclusive = STRUCTURED_COMMANDS.map((held) => held.operation === "home.busy" ? { ...held, exclusive: true } : held);
  expect(structuredRegistryFault(exclusive, CLI_CONTRACTS)).toBe("home.busy has the wrong exclusive");
});

test("every structured registry bound has descriptor provenance", () => {
  for (const entry of STRUCTURED_COMMANDS) {
    const changed = CLI_CONTRACTS.map((descriptor) => descriptor.operation === entry.operation
      ? { ...descriptor, limits: Object.fromEntries(Object.entries(descriptor.limits).map(([name, value]) => [name, value + 1])) }
      : descriptor);
    expect(structuredRegistryFault(STRUCTURED_COMMANDS, changed), entry.operation).toBe(`${entry.operation} has the wrong resultBytes`);
  }
});

test("exclusive framing returns documents at any exit and command refusals at exits 1 through 5", () => {
  const contract = structuredContract("assembly.update"), document = success(contract.kind);
  const held = decodeDocument(result(2, document), contract);
  expect(held).toMatchObject({ kind: "document", exit: 2, command: { exit: 2, stdout: document } });
  for (const exit of [1, 2, 3, 4, 5]) {
    const bytes = refusal(contract.operation);
    const refused = decodeDocument(result(exit, Buffer.alloc(0), bytes), contract);
    expect(refused).toMatchObject({ kind: "error", exit, error: { error: { operation: contract.operation } }, command: { stderr: bytes } });
  }
});

test("all 21 common refusals use their error contract rather than their success bound", () => {
  for (const contract of STRUCTURED_COMMANDS) {
    const bytes = refusal(contract.operation);
    expect(decodeDocument(result(2, Buffer.alloc(0), bytes), contract), contract.operation)
      .toMatchObject({ kind: "error", exit: 2, command: { stderr: bytes } });
  }
});

test("the decoder preserves each command's inclusive or exclusive published byte bound", () => {
  const bytes = success("bot.capabilities"), inclusive = { ...structuredContract("capabilities"), resultBytes: bytes.length };
  expect(decodeDocument(result(0, bytes), inclusive)).toMatchObject({ kind: "document" });
  const exclusive = { ...inclusive, exclusive: true };
  expect(() => decodeDocument(result(0, bytes), exclusive)).toThrow("violated its structured document contract");
  const busy = line({ schemaVersion: 1, kind: "bot.home.busy", data: { busy: false } });
  expect(busy).toHaveLength(65);
  expect(decodeDocument(result(0, busy), structuredContract("home.busy"))).toMatchObject({ kind: "document" });
  expect(() => decodeDocument(result(0, Buffer.concat([busy.subarray(0, -1), Buffer.from(" \n")])), structuredContract("home.busy")))
    .toThrow("violated its structured document contract");
});

test("exclusive framing rejects malformed, cross-operation, wrong-version, forbidden, and dual output", () => {
  const contract = structuredContract("run.show"), valid = success(contract.kind), bad = refusal(contract.operation);
  const cases = [
    result(0, Buffer.from("not json\n")),
    result(0, line({ schemaVersion: 1, kind: "bot.run.list", data: {} })),
    result(0, line({ schemaVersion: 2, kind: contract.kind, data: {} })),
    result(0, valid, Buffer.from("diagnostic\n")),
    result(2, valid, bad),
    result(2, Buffer.alloc(0), refusal("run.list")),
    result(2, Buffer.alloc(0), Buffer.from(bad.toString().trimEnd())),
  ];
  for (const held of cases) expect(() => decodeDocument(held, contract)).toThrow("violated its structured document contract");
});

test("login treats all prefix lines as opaque and only decodes the final refusal", () => {
  const contract = structuredContract("auth.login"), document = success(contract.kind);
  const inert = refusal("auth.login"), interaction = Buffer.concat([inert, Buffer.from("provider prompt\n")]);
  const accepted = decodeDocument(result(0, document, interaction), contract);
  expect(accepted).toMatchObject({ kind: "document", command: { stdout: document, stderr: interaction } });
  const final = refusal("auth.login", "provider-failed"), stderr = Buffer.concat([interaction, final]);
  const refused = decodeDocument(result(4, Buffer.alloc(0), stderr), contract);
  expect(refused).toMatchObject({ kind: "error", error: { error: { cause: "provider-failed" } }, command: { stderr } });
});

test("login admits only bounded terminal refusals and its matching synchronization result", () => {
  const contract = structuredContract("auth.login"), document = success(contract.kind);
  const sync = refusal("auth.login", "synchronization-failed"), accepted = decodeDocument(result(5, document, sync), contract);
  expect(accepted).toMatchObject({ kind: "error", command: { stdout: document, stderr: sync } });
  const failures = [
    result(4, Buffer.alloc(0), Buffer.from("provider prompt\n")),
    result(4, Buffer.alloc(0), refusal("auth.logout")),
    result(4, document, refusal("auth.login", "provider-failed")),
    result(5, Buffer.alloc(0), sync),
    result(4, Buffer.alloc(0), Buffer.concat([Buffer.alloc(67_584, 0x61), refusal("auth.login")])),
    result(4, Buffer.alloc(0), Buffer.from(refusal("auth.login").toString().trimEnd())),
  ];
  for (const held of failures) expect(() => decodeDocument(held, contract)).toThrow("violated its structured document contract");
});

test("logout accepts only the exact advisory and its matching final envelope", () => {
  expect(Buffer.byteLength(RETIRED_CREDENTIAL_ADVISORY)).toBe(80);
  const contract = structuredContract("auth.logout"), document = success(contract.kind), advisory = Buffer.from(RETIRED_CREDENTIAL_ADVISORY);
  expect(decodeDocument(result(0, document, advisory), contract)).toMatchObject({ kind: "document", command: { stderr: advisory } });
  const ordinary = refusal("auth.logout", "logout-failed"), refused = decodeDocument(result(5, Buffer.alloc(0), Buffer.concat([advisory, ordinary])), contract);
  expect(refused).toMatchObject({ kind: "error", command: { stderr: Buffer.concat([advisory, ordinary]) } });
  const sync = refusal("auth.logout", "synchronization-failed");
  expect(decodeDocument(result(5, document, Buffer.concat([advisory, sync])), contract)).toMatchObject({ kind: "error", command: { stdout: document } });
  const failures = [
    result(0, document, Buffer.from("provider prompt\n")),
    result(0, document, Buffer.concat([advisory, advisory])),
    result(5, Buffer.alloc(0), Buffer.concat([Buffer.from("provider prompt\n"), ordinary])),
    result(5, Buffer.alloc(0), Buffer.concat([advisory, advisory, ordinary])),
    result(5, document, ordinary),
    result(5, Buffer.alloc(0), sync),
    result(5, document, refusal("auth.login", "synchronization-failed")),
  ];
  for (const held of failures) expect(() => decodeDocument(held, contract)).toThrow("violated its structured document contract");
});

test("invariant messages are bounded and contain none of the command bytes", () => {
  expect.assertions(2);
  const secret = "never echo this command output";
  try { decodeDocument(result(0, Buffer.from(`${secret}\n`)), structuredContract("capabilities")); }
  catch (reason) {
    expect((reason as Error).message).not.toContain(secret);
    expect(Buffer.byteLength((reason as Error).message)).toBeLessThan(256);
  }
});
