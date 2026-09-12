import { expect, test } from "vitest";
import { main, type CliBoundary } from "../src/cli.ts";

const clock = {
  milliseconds: () => { throw new Error("retired commands must not read the clock"); },
  timestamp: () => { throw new Error("retired commands must not read the clock"); },
  setTimeout: () => { throw new Error("retired commands must not start timers"); },
  clearTimeout: () => { throw new Error("retired commands must not clear timers"); },
};

const retired = [
  ["run", "assembly/flow"], ["resume", "run-id"], ["check", "assembly/flow"], ["runs"],
  ["show", "run-id"], ["output", "run-id"], ["draft", "run-id", "stage"],
  ["rejected", "run-id", "stage"], ["request", "run-id"], ["capture", "run-id"],
  ["logs"], ["session", "run-id", "stage"], ["explain", "run-id"], ["find", "text"],
  ["status"], ["busy", "/work"], ["prune"], ["config"], ["models"], ["assembly"], ["auth"],
] as const;

const ambiguousRunNouns = ["start-old", "resume-old", "list-old", "show-old", "check-old", "checklist-old", "events-old", "output-old", "request-old", "record-old", "session-old"];

function capture(): { boundary: CliBoundary; stdout: Buffer[]; stderr: Buffer[] } {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const poison = () => { throw new Error("retired commands must not cross an external boundary"); };
  const boundary: CliBoundary = {
    cwd: "/should-not-be-read",
    env: new Proxy({}, { get: poison }),
    stdinIsTTY: true,
    stderrIsTTY: false,
    readStdin: () => { poison(); return Promise.resolve(Buffer.alloc(0)); },
    stdout: (bytes) => { stdout.push(Buffer.from(bytes)); },
    stderr: (bytes) => { stderr.push(Buffer.from(bytes)); },
    clock,
    modelRuntime: poison,
    authRuntime: poison,
    authLogoutRuntime: poison,
    authListRuntime: poison,
    authProvider: poison,
    beforeCredentialAccess: poison,
    retiredCredentialPath: "/should-not-be-read",
  };
  return { boundary, stdout, stderr };
}

async function expectUnknown(argv: readonly string[]): Promise<void> {
  const held = capture();
  await expect(main([...argv, "--home", "/also-should-not-be-read"], held.boundary)).resolves.toBe(2);
  expect(Buffer.concat(held.stdout).toString()).toBe("");
  const diagnostic = Buffer.concat(held.stderr).toString();
  expect(diagnostic).toMatch(/^request-invalid  \S+\n  Use /u);
  expect(Buffer.byteLength(diagnostic)).toBeLessThanOrEqual(2_048);
}

test("every retired root takes the generic unknown-command path without external access", async () => {
  for (const argv of retired) await expectUnknown(argv);
});

test("ambiguous run nouns remain unknown instead of becoming assembly targets", async () => {
  for (const target of ambiguousRunNouns) await expectUnknown(["run", target]);
});

test("retired help and bare noun-group help take the generic unknown-command path", async () => {
  for (const argv of [...retired.map(([root]) => [root, "--help"]), ["run", "--help"], ["assembly", "--help"], ["auth", "--help"]]) {
    await expectUnknown(argv);
  }
});

test("exact current command help remains available", async () => {
  for (const argv of [["run", "start", "--help"], ["assembly", "list", "--help"], ["auth", "list", "--help"]]) {
    const held = capture();
    await expect(main(argv, held.boundary)).resolves.toBe(0);
    expect(Buffer.concat(held.stdout).toString()).toMatch(/^usage: bot /u);
    expect(Buffer.concat(held.stderr).toString()).toBe("");
  }
});

test("the root overview lists only current commands", async () => {
  const held = capture();
  await expect(main([], held.boundary)).resolves.toBe(0);
  const overview = Buffer.concat(held.stdout).toString();
  for (const descriptor of ["run start", "run list", "assembly check", "auth list", "model list"]) expect(overview).toContain(descriptor);
  for (const root of ["runs", "show", "logs", "prune", "config", "models"]) expect(overview).not.toMatch(new RegExp(`^\\s*${root}(?:\\s|$)`, "mu"));
});
