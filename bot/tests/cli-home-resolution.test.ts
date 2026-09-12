// Ticket 0051 — pin queue P9: the home-resolution ladder, every leg
// discriminated, end to end through the REAL defaultGating via main() with the
// faux provider (the cli-stage-options idiom, 0041; the peel shape, 0046).
// The assertion source is home.md:17-19: "`$BOT_HOME` if it is set, otherwise
// `${XDG_DATA_HOME:-~/.local/share}/bot`. A `--home` given on the command line
// names the home directly and wins over both." Code: resolveHome
// (invocation.ts:34-39).
//
// The discrimination fixture (ticket item 1): FOUR scratch homes exist in
// every run, each holding a same-named `review/main` assembly whose stage body
// carries a DISTINCT marker. The winner is proven TWO ways in every leg:
//   1. the marker — the run's captured hook output (hooks.md: "Whatever a hook
//      prints ... is captured as diagnostics and kept with the run") is exactly
//      the WINNING home's marker line and no loser's;
//   2. the location — a run directory appears under the winner's `runs/`, and
//      the losing homes have no `runs/` at all (run.ts:298-299 mkdirs `runs/`
//      only once a run actually starts, so its ABSENCE is honest evidence that
//      nothing ran there — record.md's "absence means it never existed").
//
// Consolidation (stated): legs 2a/2c/2d/2e are ONE peel over ONE fixture, four
// runs. Run k has candidates k..3 in play and asserts candidate k wins, so run
// k discriminates candidate k against EVERY lower candidate still present —
// run 0 alone witnesses `--home` beating BOT_HOME **and** XDG_DATA_HOME at
// once (leg 2a's "wins over both"), run 1 witnesses BOT_HOME over XDG (2c) and
// over the ~ fallback, run 2 XDG over the ~ fallback (2d), run 3 the ~
// fallback itself (2e). Six ordered pairs, witnessed directly, no appeal to
// transitivity. Legs 2b (relative `--home`) and 3 (no fall-through) are their
// own runs.
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main, type CliBoundary } from "./initialized-cli.ts";
import { resolveHome } from "../src/invocation.ts";
import type { DriverClock } from "../src/process.ts";

const roots: string[] = [];
const clock: DriverClock = {
  milliseconds: () => performance.now(),
  timestamp: () => new Date().toISOString(),
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
};

// The ONE guarded mutation of the real process environment, and it lives in a
// single test (the leg 2e boundary unit test at the bottom of this file).
// Since ticket 0053 the `~/.local/share` rung is steered by the INJECTED env's
// HOME (invocation.ts:37), so every e2e leg reaches it by injection alone and
// the real ~/.local/share is never a candidate home; homedir() answers only
// when the injected environment carries no HOME at all, which is exactly what
// that one unit test discriminates. afterEach restores the saved value even
// when the test fails. Doctrine's env rules are src-only (eslint.config.js scopes
// NO_AMBIENT_ENV to src/**/*.ts; scripts/check-lint-rules.mjs case "scope"
// asserts a test file is out of scope), and vitest's default forks pool
// isolates each test FILE in its own process with tests inside it sequential,
// so the mutation cannot leak into another file's run.
const savedHome = process.env["HOME"];

afterEach(async () => {
  if (savedHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = savedHome;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

// The env is built EXPLICITLY per leg: BOT_HOME and XDG_DATA_HOME are
// destructured out of the inherited environment so a leg that needs them
// ABSENT really has them absent, while PATH and the rest still pass through.
// XDG_CACHE_HOME always sits inside the scratch root, so no leg touches the
// real cache (slots.md: scratch "sits in a cache directory the runtime owns").
function realBoundary(root: string, cwd: string, env: NodeJS.ProcessEnv, output: Buffer[], errors: Buffer[]) {
  const faux = fauxProvider({ tokensPerSecond: 10_000, models: [{ id: "faux-1" }] });
  const models = createModels();
  models.setProvider(faux.provider);
  const { BOT_HOME: _botHome, XDG_DATA_HOME: _xdgData, ...inherited } = process.env;
  const held: CliBoundary = {
    cwd,
    env: { ...inherited, PWD: cwd, XDG_CACHE_HOME: join(root, "cache"), ...env },
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

function writes(content: string) {
  return [
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content })], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
  ];
}

// A home is a directory holding `assemblies/` and (once something runs)
// `runs/` — home.md "What is in it". Every candidate home gets the SAME
// assembly name, `review`, the SAME flow, `main`, and the SAME stage,
// `01-work`; only the marker inside the stage's authored files differs, so
// nothing but the resolution ladder can decide which one runs.
//
// The marker rides in the stage's `success` hook, an authored file of THIS
// home's assembly, because a hook's print is "captured as diagnostics and kept
// with the run" (hooks.md) — an on-disk byte-for-byte witness that the winning
// home's own assembly files are what executed. (The stage BODY reaches only
// the system prompt, which nothing durable holds; the hook capture is the
// authored-marker seam the record does keep.)
async function homeWith(home: string, marker: string): Promise<void> {
  const stage = join(home, "assemblies/review/flows/main/01-work");
  await mkdir(stage, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(home, "assemblies/review/flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(stage, "STAGE.md"), `---\n---\nDo the work for ${marker}.\n`),
    writeFile(join(stage, "success"), `#!/bin/sh\nprintf 'ran=[%s]\\n' '${marker}'\nexit 0\n`),
  ]);
  await chmod(join(stage, "success"), 0o755);
}

// run.ts:298-299 creates `runs/` only when a run starts, so a home that never
// ran has no `runs/` directory at all — the honest "nothing ran here".
async function runsIn(home: string): Promise<string[]> {
  return existsSync(join(home, "runs")) ? readdir(join(home, "runs")) : [];
}

interface Candidate { marker: string; home: string }

// The four candidate homes of the ladder, most specific first. `data` is what
// XDG_DATA_HOME names (the home is `$XDG_DATA_HOME/bot` — home.md:17); `user`
// is what HOME names (the home is `$HOME/.local/share/bot`).
function candidates(root: string): { flag: Candidate; bot: Candidate; xdg: Candidate; user: Candidate; data: string; home: string } {
  const data = join(root, "xdg-data");
  const user = join(root, "user");
  return {
    flag: { marker: "MARKER-FLAG", home: join(root, "by-flag") },
    bot: { marker: "MARKER-BOT-HOME", home: join(root, "by-bot-home") },
    xdg: { marker: "MARKER-XDG", home: join(data, "bot") },
    user: { marker: "MARKER-HOMEDIR", home: join(user, ".local", "share", "bot") },
    data,
    home: user,
  };
}

async function scratch(prefix: string) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  const held = candidates(root);
  await Promise.all([held.flag, held.bot, held.xdg, held.user].map((one) => homeWith(one.home, one.marker)));
  return { root, ...held };
}

// The two witnesses, asserted together:
//   1. MARKER — the run's captured hook output is EXACTLY the winning home's
//      marker line, so the assembly whose files ran is the winner's and no
//      loser's (equality, not containment: a loser's marker cannot hide in it);
//   2. LOCATION — exactly one run directory under the winner's `runs/`, and
//      every losing home has no `runs/` at all.
async function witness(winner: Candidate, losers: Candidate[]): Promise<void> {
  const runs = await runsIn(winner.home);
  expect(runs).toHaveLength(1);
  const capture = join(winner.home, "runs", runs[0] ?? "", "stages/01-work/1/1/hooks/success.txt");
  await expect(readFile(capture, "utf8")).resolves.toBe(`ran=[${winner.marker}]\n`);
  for (const loser of losers) await expect(runsIn(loser.home)).resolves.toEqual([]);
}

// The peel: index k keeps candidates k..3 reachable and strips the ones above.
const PEEL = [
  { leg: "2a", rung: "--home", stripped: "" },
  { leg: "2c", rung: "BOT_HOME", stripped: "--home" },
  { leg: "2d", rung: "XDG_DATA_HOME", stripped: "--home, BOT_HOME" },
  { leg: "2e", rung: "~/.local/share", stripped: "--home, BOT_HOME, XDG_DATA_HOME" },
] as const;

for (const [peeled, step] of PEEL.entries()) {
  test(`leg ${step.leg} — peel ${String(peeled)}${step.stripped === "" ? " (all four candidates in play)" : ` (without ${step.stripped})`}: the home is ${step.rung}'s, and no lower candidate ran`, async () => {
    const held = await scratch("bot-cli-home-ladder-");
    const ladder = [held.flag, held.bot, held.xdg, held.user];
    const winner = ladder[peeled] ?? held.flag;
    // The ~ rung is steered by the INJECTED HOME below (invocation.ts:37,
    // ticket 0053) — no process-environment mutation is needed to reach it.
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const { held: boundary, faux } = realBoundary(held.root, held.root, {
      HOME: held.home,
      ...(peeled <= 1 ? { BOT_HOME: held.bot.home } : {}),
      ...(peeled <= 2 ? { XDG_DATA_HOME: held.data } : {}),
    }, stdout, stderr);
    faux.setResponses(writes("the answer"));

    const invocation = ["run", "start", "review/main", "the request", ...(peeled === 0 ? ["--home", held.flag.home] : [])];
    await expect(main(invocation, boundary)).resolves.toBe(0);
    expect(Buffer.concat(stderr).toString()).toBe("");
    expect(Buffer.concat(stdout).toString()).toBe("the answer");

    // home.md:18 "wins over both" at peel 0; home.md:17 "if it is set" at peel
    // 1; home.md:17 "${XDG_DATA_HOME:-...}/bot" at peel 2; the `~/.local/share`
    // default at peel 3. Every candidate BELOW the winner is still authored and
    // still present on disk, so each run orders the winner strictly above all
    // of them at once.
    await witness(winner, ladder.slice(peeled + 1));
  });
}

// Leg 2b — a CODE-LEVEL pin, not a spec pin. home.md:18 says only that a
// `--home` "names the home directly"; it is SILENT on what a relative path is
// relative to. invocation.ts:35 answers it: `resolve(dir, raw)`, where `dir`
// is the caller's working directory (the injected boundary cwd — cli.ts:121
// passes boundary.cwd into readInvocationTokens). Reported as an implicit
// behavior the spec leaves open, NOT as a divergence.
//
// The discriminator is sharp: the boundary cwd is a SUBDIRECTORY of the
// scratch root and the flag is `../by-flag`, which names nothing relative to
// the vitest process's own cwd (the repo). Were the resolution ambient, the
// path would not exist and the run would refuse; were the flag ignored,
// BOT_HOME's home would run.
test("leg 2b — a relative --home resolves against the CALLER's working directory (the boundary cwd), and still wins over BOT_HOME", async () => {
  const held = await scratch("bot-cli-home-relative-");
  const work = join(held.root, "work");
  await mkdir(work, { recursive: true });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held: boundary, faux } = realBoundary(held.root, work, {
    HOME: held.home, BOT_HOME: held.bot.home, XDG_DATA_HOME: held.data,
  }, stdout, stderr);
  faux.setResponses(writes("the answer"));

  await expect(main(["run", "start", "review/main", "the request", "--home", "../by-flag"], boundary)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("the answer");

  await witness(held.flag, [held.bot, held.xdg, held.user]);
});

// Leg 3 (ticket item 3) — failure honesty: the ladder is walked ONCE. A
// `--home` that resolves to a real directory which simply does not hold the
// assembly refuses `assembly-unknown` (invocation.ts:185, "Name an assembly
// that exists") — it does NOT fall back down the ladder to BOT_HOME's home,
// which does hold `review/main` and would have run happily. home.md:18's
// "wins over both" is a resolution, not a search order.
test("leg 3 — a resolvable but assembly-less --home refuses assembly-unknown and does not fall through to BOT_HOME's home, which has the assembly", async () => {
  const held = await scratch("bot-cli-home-no-fallthrough-");
  const empty = join(held.root, "empty-home");
  await mkdir(join(empty, "assemblies"), { recursive: true });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held: boundary, faux } = realBoundary(held.root, held.root, {
    HOME: held.home, BOT_HOME: held.bot.home, XDG_DATA_HOME: held.data,
  }, stdout, stderr);
  faux.setResponses(writes("the answer"));

  await expect(main(["run", "start", "review/main", "the request", "--home", empty], boundary)).resolves.toBe(2);
  expect(Buffer.concat(stdout).toString()).toBe("");
  // The fault vocabulary, on the target that could not be found.
  expect(Buffer.concat(stderr).toString()).toBe("assembly-unknown  review/main\n  Name an assembly that exists.\n");

  // The second witness, in its negative form: NO home ran. In particular the
  // BOT_HOME home, which holds a perfectly good review/main, has no runs/.
  for (const home of [empty, held.flag.home, held.bot.home, held.xdg.home, held.user.home]) {
    await expect(runsIn(home)).resolves.toEqual([]);
  }
});

// The ~ rung at the unit seam (ticket 0053). invocation.ts:41-42 says "XDG and
// HOME come from the injected environment, never ambient" — now true of BOTH
// functions it sits above: resolveHome's `~` fallback reads the INJECTED env's
// HOME first (invocation.ts:37, scratchRoot's idiom at :44), and only when the
// injected environment carries no HOME at all does homedir() — which reads the
// PROCESS environment — answer as the last resort. The seam is no longer
// ambient-first; it is injected-first with an ambient floor. This test pins
// both halves. (No run happens here, so nothing is written to disk at all.)
test("leg 2e boundary — resolveHome's ~ fallback is steered by the INJECTED env's HOME, with the process environment's HOME only as the last resort", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-home-fallback-"));
  roots.push(root);
  const user = join(root, "user");
  // The ONE guarded mutation of the real process environment left in this file
  // (afterEach restores it even on failure): it is the only way to steer
  // homedir() and so the only way to discriminate the ambient FLOOR below.
  process.env["HOME"] = user;

  // home.md:17's `~/.local/share` default with an EMPTY injected environment:
  // no injected HOME, so the process environment's HOME answers through
  // homedir() — the last resort, still reachable.
  expect(resolveHome(root, undefined, {})).toBe(join(user, ".local", "share", "bot"));
  expect(resolveHome(root, undefined, {})).toBe(join(homedir(), ".local", "share", "bot"));

  // The flip (ticket 0053): an injected HOME DOES steer the fallback, and beats
  // the process environment's HOME, which points somewhere else entirely.
  expect(resolveHome(root, undefined, { HOME: join(root, "decoy") })).toBe(join(root, "decoy", ".local", "share", "bot"));
  expect(resolveHome(root, undefined, { HOME: join(root, "decoy") })).not.toBe(join(homedir(), ".local", "share", "bot"));

  // And the rungs above it still come from the injected env, as the comment
  // promises: XDG_DATA_HOME displaces the ~ default, BOT_HOME displaces both,
  // and --home displaces all three (home.md:17-19).
  expect(resolveHome(root, undefined, { XDG_DATA_HOME: join(root, "xdg-data") })).toBe(join(root, "xdg-data", "bot"));
  expect(resolveHome(root, undefined, { BOT_HOME: join(root, "by-bot-home"), XDG_DATA_HOME: join(root, "xdg-data") })).toBe(join(root, "by-bot-home"));
  expect(resolveHome(root, "by-flag", { BOT_HOME: join(root, "by-bot-home"), XDG_DATA_HOME: join(root, "xdg-data") })).toBe(join(root, "by-flag"));
});

// BOT_HOME is settled at the caller's process boundary just as --home is, so
// every downstream use carries one absolute home rather than a cwd-relative
// spelling that changes meaning when it is read later.
test("a relative BOT_HOME resolves against the caller's working directory", () => {
  expect(resolveHome("/caller/work", undefined, { BOT_HOME: "./homes/x" })).toBe("/caller/work/homes/x");
});
