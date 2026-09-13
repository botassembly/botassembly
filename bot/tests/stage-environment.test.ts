// Ticket 0139 legs 0, 2 and 4 — what a stage's shell really holds.
//
// home.md: "A caller's `$BOT_HOME` is the runtime's to read and never the
// agent's to see: it is the one variable scrubbed from every stage's
// environment." flow.ts deletes it from the env it composes, and cli.test.ts
// witnesses a GATE seeing none of it — but a gate is a process bot spawns and
// a stage shell is a process PI spawns, and those are not the same seam.
//
// Pi's bash tool hard-codes `inheritEnv: true` (pi-agent-core
// dist/harness/tools/bash.js:33-34) and `getShellEnv` spreads raw `process.env`
// UNDERNEATH the supplied env when inheritance is on (dist/harness/env/
// nodejs.js:190-198), so every name bot scrubbed came back in every shell the
// agent ran, along with whatever else the caller's process was carrying.
//
// These tests drive the REAL main() with the faux provider calling the REAL
// bash tool, and read what the shell actually saw. The boundary env is built
// EXPLICITLY — never `...process.env` — so a name in the shell that is not in
// the list below arrived from somewhere other than the boundary.
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { main, type CliBoundary } from "./initialized-cli.ts";
import type { DriverClock } from "../src/process.ts";

const roots: string[] = [];
const clock: DriverClock = {
  milliseconds: () => performance.now(),
  timestamp: () => new Date().toISOString(),
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
};

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** The two names planted in `process.env` and nowhere else: the one the spec
 *  says is scrubbed, and a stand-in for the ambient API key a real caller's
 *  process carries. Neither is ever a real credential. */
const PLANTED_HOME = "/planted/leaky/home";
const DECOY = "BOT_DECOY_TOKEN";
const DECOY_VALUE = "decoy-not-a-credential";

async function ground(prefix: string): Promise<{ root: string; home: string }> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  const home = join(root, "home");
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(flow, "01-work.md"), "---\n---\nDo the work.\n"),
  ]);
  return { root, home };
}

/** A directory on the boundary's PATH holding one executable found by NO other
 *  means: bash falls back to a compiled-in PATH when the variable is unset, so
 *  a bare `ls` resolves in a shell that was handed no environment at all and
 *  witnesses nothing. This one resolves only if bot's PATH reached the shell. */
const PROBE = "bot-path-probe";

async function probeOnPath(root: string): Promise<string> {
  const bin = join(root, "bin");
  await mkdir(bin, { recursive: true });
  await writeFile(join(bin, PROBE), "#!/bin/sh\nprintf 'the probe ran'\n");
  await chmod(join(bin, PROBE), 0o755);
  return bin;
}

/** An EXPLICIT boundary environment: PATH so a shell can find its coreutils,
 *  and the three names every cli test sets. Nothing inherited. */
function boundary(root: string, home: string, output: Buffer[], errors: Buffer[]) {
  const faux = fauxProvider({ tokensPerSecond: 10_000, models: [{ id: "faux-1" }] });
  const models = createModels();
  models.setProvider(faux.provider);
  const held: CliBoundary = {
    cwd: root,
    env: { PATH: `${join(root, "bin")}:${process.env["PATH"] ?? ""}`, BOT_HOME: home, PWD: root, XDG_CACHE_HOME: join(root, "cache") },
    stdinIsTTY: true,
    stderrIsTTY: false,
    readStdin: () => Promise.resolve(Buffer.alloc(0)),
    stdout: (bytes) => { output.push(Buffer.from(bytes)); },
    stderr: (bytes) => { errors.push(Buffer.from(bytes)); },
    clock,
    models,
  };
  return { held, faux };
}

function shellThen(command: string) {
  return [
    fauxAssistantMessage([fauxToolCall("bash", { command })], { stopReason: "toolUse" }),
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "done" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("finished"),
    fauxAssistantMessage("finish anyway"),
  ];
}

/** One run whose stage shell executes `command`, and the run's home. */
async function ran(prefix: string, command: string): Promise<{ root: string; home: string }> {
  const { root, home } = await ground(prefix);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = boundary(root, home, stdout, stderr);
  faux.setResponses(shellThen(command));
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  return { root, home };
}

// LEG 0 / LEG 2. Red first: with the leak, `home=[/planted/leaky/home]` and
// `decoy=[decoy-not-a-credential]` — both planted in `process.env` alone, both
// resurfaced underneath the env bot composed. Green: both empty, and the
// stage's own slots still there, which is what says the shell was not simply
// emptied.
test("a stage shell holds only what bot put there: nothing of process.env resurfaces beneath the injected env", async () => {
  vi.stubEnv("BOT_HOME", PLANTED_HOME);
  vi.stubEnv(DECOY, DECOY_VALUE);
  const held = await mkdtemp(join(tmpdir(), "bot-stage-env-capture-"));
  roots.push(held);
  const capture = join(held, "seen.txt");
  const { root } = await ran("bot-stage-env-", `printf 'home=[%s] decoy=[%s] tmp=[%s] pwd=[%s] backing=[%s]' "$BOT_HOME" "$${DECOY}" "$TMP" "$PWD" "$(readlink -f \"$TMP\")" > '${capture}'`);
  const seen = await readFile(capture, "utf8");
  expect(seen).toContain("home=[]");
  expect(seen).toContain("decoy=[]");
  // The shell is the stage's, not an empty one: its slots are there, PWD is
  // the tree the work happens in, and $TMP is under the run's scratch.
  expect(seen).toContain(`pwd=[${root}]`);
  expect(seen).toMatch(/backing=\[[^\]]*\/cache\/bot\/tmp\//u);
});

// LEG 2's trap, witnessed rather than trusted: turning inheritance off also
// drops the tool's own `shellEnv` (nodejs.js:190-192 returns `{...extraEnv}`
// alone, dropping the base env with `process.env`), so the supplied
// environment has to be COMPLETE — PATH included, or the agent gets a shell it
// cannot run a program in. Witnessed by a program that lives ONLY on the PATH
// bot supplied, invoked by bare name.
test("the supplied stage environment is COMPLETE: a program only bot's PATH can find still runs", async () => {
  const { root, home } = await ground("bot-stage-path-");
  const bin = await probeOnPath(root);
  const capture = join(root, "probe.txt");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = boundary(root, home, stdout, stderr);
  // The premise: nothing but bot's own PATH leads here. A shell falling back to
  // bash's compiled-in PATH, or to any ambient one, cannot reach this file.
  expect(process.env["PATH"]?.split(":")).not.toContain(bin);
  faux.setResponses(shellThen(`${PROBE} > '${capture}'`));
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  await expect(readFile(capture, "utf8")).resolves.toBe("the probe ran");
});

test("a newly admitted built-in Pi credential name is removed from the real stage shell", async () => {
  const { root, home } = await ground("bot-stage-baseten-env-");
  const capture = join(root, "baseten.txt");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = boundary(root, home, stdout, stderr);
  held.env["BASETEN_API_KEY"] = DECOY_VALUE;
  faux.setResponses(shellThen(`printf '[%s]' "$BASETEN_API_KEY" > '${capture}'`));

  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  await expect(readFile(capture, "utf8")).resolves.toBe("[]");
});

// Ticket 0144 leg 4 — the same rule for the temporaries a stage makes ITSELF.
// Pi's own spill was moved into scratch by 0139; a shell that runs `mktemp`, or
// a program that asks its language for a temp directory, still read `TMPDIR`
// and landed in the machine's host temp directory — outside the run, pruned by nobody. The
// composed environment supplies it now, pointing at the stage's own `$TMP`, so
// the two agree by construction and the file below is asserted to be BOTH under
// scratch and where `$TMP` says.
test("a stage shell's own mktemp lands in the stage's scratch, because TMPDIR is $TMP", async () => {
  const held = await mkdtemp(join(tmpdir(), "bot-stage-tmpdir-capture-"));
  roots.push(held);
  const capture = join(held, "seen.txt");
  const { root } = await ran("bot-stage-tmpdir-", `made="$(mktemp)"; printf 'made=[%s] tmpdir=[%s] tmp=[%s] backing=[%s] made-backing=[%s]' "$made" "$TMPDIR" "$TMP" "$(readlink -f "$TMP")" "$(readlink -f "$made")" > '${capture}'`);
  const seen = await readFile(capture, "utf8");
  const tmp = /tmp=\[([^\]]*)\]/u.exec(seen)?.[1] ?? "";
  const backing = /backing=\[([^\]]*)\]/u.exec(seen)?.[1] ?? "";
  const madeBacking = /made-backing=\[([^\]]*)\]/u.exec(seen)?.[1] ?? "";
  expect(seen).toContain(`tmpdir=[${tmp}]`);
  expect(backing.startsWith(`${join(await realpath(root), "cache", "bot", "tmp")}/`)).toBe(true);
  expect(madeBacking.startsWith(`${backing}/`)).toBe(true);
});

// A socket cannot fit under the current cache path: this is a real stage shell
// and a real Unix-domain bind, rather than a calculation over a copied path.
test("a stage can bind an ordinary Unix socket beneath its short $TMPDIR", async () => {
  const held = await mkdtemp(join(tmpdir(), "bot-stage-socket-capture-"));
  roots.push(held);
  const probe = join(held, "socket-probe.cjs");
  const slots = join(held, "slots.json");
  const bound = join(held, "bound.txt");
  await writeFile(probe, `
const { writeFileSync } = require("node:fs");
const { createServer } = require("node:net");
const { join } = require("node:path");
const tmp = process.env.TMP;
writeFileSync(process.argv[2], JSON.stringify({ tmp, tmpdir: process.env.TMPDIR }));
const server = createServer();
server.once("error", (error) => { throw error; });
server.listen(join(tmp, "socket"), () => server.close((error) => {
  if (error !== undefined) throw error;
  writeFileSync(process.argv[3], "bound");
}));
`);

  await ran("bot-stage-socket-", `node '${probe}' '${slots}' '${bound}'`);

  const seen = JSON.parse(await readFile(slots, "utf8")) as { tmp?: string; tmpdir?: string };
  expect(seen.tmpdir).toBe(seen.tmp);
  await expect(readFile(bound, "utf8")).resolves.toBe("bound");
  expect(Buffer.byteLength(seen.tmp ?? "")).toBeLessThanOrEqual(80);
  await expect(lstat(seen.tmp ?? "")).rejects.toThrow();
});

// Pi's bash tool spills truncated output to a file minted by
// `env.createTempFile` (dist/harness/utils/shell-output.js:66). The second
// agent turn reads the spill while the stage is still live; settlement then
// removes it with the rest of `$TMP`. 3000 lines exceeds Pi's
// DEFAULT_MAX_LINES, forcing a spill.
test("a truncated shell spill remains available during its stage and is deleted at settlement", async () => {
  const { root, home } = await ground("bot-stage-spill-");
  const capture = join(root, "spill.txt");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = boundary(root, home, stdout, stderr);
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("bash", { command: "seq 1 3000" })], { stopReason: "toolUse" }),
    fauxAssistantMessage([fauxToolCall("bash", { command: `printf '%s\\n' "$TMP" > '${capture}'; find -H "$TMP" -name 'pi-output-*.log' -exec cat {} \\; >> '${capture}'` })], { stopReason: "toolUse" }),
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "done" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("finished"),
    fauxAssistantMessage("finish anyway"),
  ]);
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  const [tmp, ...spill] = (await readFile(capture, "utf8")).split("\n");
  expect(spill.join("\n")).toContain("3000");
  await expect(readdir(tmp ?? "")).rejects.toThrow();
});
