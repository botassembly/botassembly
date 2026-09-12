// Ticket 0021 — the CLI describes itself. Help is asked for (exit 0, one
// plain screen on stdout); usage errors stay earned (exit 2, one-line hint
// on stderr). Red first: today `bot run --help` exits 2 with the error hint.
import { expect, test } from "vitest";
import * as cli from "./initialized-cli.ts";

const { main } = cli;

const clock = {
  milliseconds: () => performance.now(),
  timestamp: () => new Date().toISOString(),
  setTimeout: (callback: () => void, milliseconds: number) => setTimeout(callback, milliseconds),
  clearTimeout: (handle: unknown) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
};

interface Captured {
  boundary: cli.CliBoundary;
  stdout: Buffer[];
  stderr: Buffer[];
}

function captured(): Captured {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const boundary: cli.CliBoundary = {
    cwd: "/",
    env: { BOT_HOME: "/nonexistent-bot-home" },
    stdinIsTTY: true,
    stderrIsTTY: false,
    readStdin: () => Promise.resolve(Buffer.alloc(0)),
    stdout: (bytes) => { stdout.push(Buffer.from(bytes)); },
    stderr: (bytes) => { stderr.push(Buffer.from(bytes)); },
    clock,
  };
  return { boundary, stdout, stderr };
}

function stringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry: unknown) => typeof entry === "string");
}

// Ticket 0098: the dispatcher supplies this inventory, so a newly dispatched
// command reaches every user-visible command list without a copied test list.
function commandNames(): readonly string[] {
  const value = Object.entries(cli).find(([name]) => name === "commandNames")?.[1];
  if (!stringList(value)) throw new Error("cli must export its dispatched command inventory.");
  return value;
}

test("the dispatched command inventory retains run request", () => {
  expect(commandNames()).toContain("run request");
});

test("bot run --help exits 0 with a usage line on stdout (red first: exit 2 today)", async () => {
  const held = captured();
  await expect(main(["run", "start", "--help"], held.boundary)).resolves.toBe(0);
  const text = Buffer.concat(held.stdout).toString();
  expect(text).toContain("usage: bot run start <assembly>[/<flow>]");
  expect(text).toMatch(/--id-file\s+path\b/u);
  expect(Buffer.concat(held.stderr).toString()).toBe("");
});

test("every command's --help is one plain screen: usage, options where any, one example", async () => {
  for (const command of commandNames()) {
    const held = captured();
    await expect(main([...command.split(" "), "--help"], held.boundary)).resolves.toBe(0);
    const text = Buffer.concat(held.stdout).toString();
    expect(text).toContain(`usage: bot ${command}`);
    expect(text.split("\n").length).toBeLessThanOrEqual(32);
    expect(text).not.toContain("\u001b[");
    expect(Buffer.concat(held.stderr).toString()).toBe("");
  }
});

test("bot --help and bare bot list the commands, one line each, exit 0", async () => {
  for (const argv of [["--help"], []]) {
    const held = captured();
    await expect(main(argv, held.boundary)).resolves.toBe(0);
    const text = Buffer.concat(held.stdout).toString();
    for (const command of commandNames()) expect(text).toMatch(new RegExp(`^  ${command} `, "mu"));
    expect(text).toContain("usage: bot <command>");
    expect(Buffer.concat(held.stderr).toString()).toBe("");
  }
});

test("run list help advertises its JSON document", async () => {
  const held = captured();
  await expect(main(["run", "list", "--help"], held.boundary)).resolves.toBe(0);
  expect(Buffer.concat(held.stdout).toString()).toMatch(/^  --json\b/mu);
});

test("help output is byte-stable across two invocations", async () => {
  const first = captured();
  const second = captured();
  await main(["run", "session", "--help"], first.boundary);
  await main(["run", "session", "--help"], second.boundary);
  expect(Buffer.concat(first.stdout).equals(Buffer.concat(second.stdout))).toBe(true);
});

test("usage errors stay earned: exit 2 with a one-line hint on stderr, nothing on stdout", async () => {
  const unknown = captured();
  await expect(main(["bogus"], unknown.boundary)).resolves.toBe(2);
  expect(Buffer.concat(unknown.stdout).toString()).toBe("");
  // REDESIGN (ticket 0162): the refusal names every word the overview does, in
  // the overview's order — `config` (0161) and `models` (this ticket) included.
  // REDESIGN (ticket 0085): run-level directory liveness is `busy`, not the
  // retired per-stage `worktree` registry.
  const unknownMessage = Buffer.concat(unknown.stderr).toString();
  expect(unknownMessage).toMatch(/^request-invalid  bogus\n  Use /u);
  for (const command of commandNames()) expect(unknownMessage).toMatch(new RegExp(`\\b${command}\\b`, "u"));
  expect(unknownMessage).not.toContain("worktree");

  const retired = captured();
  await expect(main(["worktree", "/"], retired.boundary)).resolves.toBe(2);
  expect(Buffer.concat(retired.stdout).toString()).toBe("");
  for (const command of commandNames()) expect(Buffer.concat(retired.stderr).toString()).toContain(command);

  const show = captured();
  await expect(main(["run", "events"], show.boundary)).resolves.toBe(2);
  expect(Buffer.concat(show.stdout).toString()).toBe("");
  expect(Buffer.concat(show.stderr).toString()).toContain("Run events requires one run.");

  const helpless = captured();
  await expect(main(["bogus", "--help"], helpless.boundary)).resolves.toBe(2);
  expect(Buffer.concat(helpless.stdout).toString()).toBe("");
});
