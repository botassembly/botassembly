// Ticket 0131 ruling 2 — the home is private, and so is every run.
//
// THE DEFECT. Nothing passed a mode to any `mkdir`, so the home, `runs/`,
// `assemblies/` and every run directory were born at 0o777 minus whatever the
// caller's umask happened to remove. On a machine with the common shared-group
// umask 002 that is 775 on the directories and 664 on the files inside them:
// prompts, transcripts and sealed assemblies readable by every account in the
// group. Ruled: the home and each run directory are CREATED 0700, owner-only.
//
// WHY THE UMASK IS SET HERE. This is the one assertion in the suite that a
// build machine could make pass by accident: under a umask of 077 the old code
// already produced 0700 and this file would be green against main. So each
// test sets the umask to 0o000 for its own duration — the most permissive
// setting there is — which makes the mode the code asks for the ONLY thing
// that decides the answer. Measured against main under that umask, the home
// and the run directory both came out 0o777. Vitest gives each test file its
// own fork, so the umask this file moves is nobody else's.
//
// WHAT IS AND IS NOT ASSERTED. The doors, and not the tree beneath them: a
// directory nobody may traverse hides what is inside it whatever the modes of
// the files are, and chmodding every file would fight POSIX expectations inside
// a tree the owner already controls. So there is no assertion here about
// `record.jsonl` or a captured assembly's bytes.
//
// THE HOME'S OWN MODE IS THE PLATFORM CLAIM. Both paths that can create the
// home create it on the way to somewhere else — `runs/` for a run,
// `assemblies/` for an install — so the home is an INTERMEDIATE level of a
// recursive mkdir, and the tests below say that level carries the mode too.
// That is the behaviour to re-measure if this ever moves off Linux.
//
// Nothing here reaches a model or the real `~/.pi`, `~/.cache` or
// `~/.local/share`: the provider is faux, and BOT_HOME and XDG_CACHE_HOME are
// explicit on every invocation, under an mkdtemp root this file removes.
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { execFileSync } from "node:child_process";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { realBoundary, tempRoots, writes } from "./cli-boundary.ts";
import { homeScratch, scratchRun } from "./scratch.ts";

const roots = tempRoots();

let restore: number | undefined;

afterEach(async () => {
  if (restore !== undefined) process.umask(restore);
  restore = undefined;
  await roots.cleanup();
});

/** The most permissive umask there is, so the code's own mode is the only
 *  thing deciding what lands on disk. */
function permissive(): void {
  restore = process.umask(0o000);
}

/** The permission bits, with the ones the platform owns (setuid, setgid,
 *  sticky) masked off — a parent directory can force setgid onto its children
 *  and that is not ours to assert about. */
async function permissions(path: string): Promise<string> {
  return ((await stat(path)).mode & 0o777).toString(8);
}

/** The smallest assembly there is: one flow, one stage. */
async function reviewAssembly(base: string): Promise<string> {
  await mkdir(join(base, "flows/main"), { recursive: true });
  await Promise.all([
    writeFile(join(base, "ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(base, "flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(base, "flows/main/01-work.md"), "---\n---\nDo the work.\n"),
  ]);
  return base;
}

// WITNESS 1 — a run into a home that does not exist yet. The assembly is named
// by an absolute path and lives OUTSIDE the home (invocation.md), which is what
// leaves the home for `bot run` to create on its way to `runs/`; an assembly
// installed under `assemblies/` would mean the home already existed and this
// would assert nothing. Both doors are then born inside the one invocation.
test("a configured home and its new run directory stay owner-only", async () => {
  permissive();
  const { root, home } = await roots.scratch("bot-home-private-run-");
  const source = await reviewAssembly(join(root, "source"));
  await mkdir(home, { mode: 0o700 });
  await writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n");

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([writes("$OUTPUT", "the answer"), fauxAssistantMessage("done")]);
  await expect(main(["run", "start", `${source}/main`, "the request"], held)).resolves.toBe(0);

  const run = (await readdir(join(home, "runs"))).find((name) => !name.endsWith(".lock")) ?? "";
  expect(run).not.toBe("");
  await expect(permissions(home)).resolves.toBe("700");
  await expect(permissions(join(home, "runs", run))).resolves.toBe("700");
});

// WITNESS 2 — the OTHER path that can create the home. An install never goes
// near `runs/`, so a fix that only touched run birth would leave a home made by
// `bot assembly install` group-readable, with every assembly it then copies in
// underneath it.
test("an install into a home that does not exist creates it owner-only", async () => {
  permissive();
  const { root, home } = await roots.scratch("bot-home-private-install-");
  const source = await reviewAssembly(join(root, "source"));

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = realBoundary(root, home, stdout, stderr);
  await expect(main(["assembly", "install", source, "--name", "review"], held)).resolves.toBe(0);

  await expect(readdir(join(home, "assemblies"))).resolves.toEqual(["review"]);
  await expect(permissions(home)).resolves.toBe("700");
});

// TICKET 0140 LEG 1 — and so is the scratch tree. 0131 closed the home and
// every run directory; the cache the runtime works in was left at umask modes,
// and it holds the same bytes. Measured on main under umask 000: `<cache>`,
// `<cache>/bot`, `bot/tmp`, the run's level, the attempt's and its `input` all
// came out 0o777, so a stage's prompt, the `$INPUT` copy of the request, the
// output it seals and the skills materialized for it were world-readable while
// the run's own copies of the same bytes were 0700.
//
// The doctrine is 0131's unchanged: ONE mode, at the level the tree is born
// from, and the doors are the whole lock — nothing beneath is moded separately
// and a directory that already stands keeps what it has. The mode rides
// `prepareStage`'s recursive mkdir, so every level it CREATES carries it.
test("a run's scratch tree is born owner-only, root to attempt", async () => {
  permissive();
  const { root, home } = await roots.scratch("bot-scratch-private-run-");
  const source = await reviewAssembly(join(root, "source"));
  await mkdir(home, { mode: 0o700 });
  await writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n");

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([writes("$OUTPUT", "the answer"), fauxAssistantMessage("done")]);
  await expect(main(["run", "start", `${source}/main`, "the request"], held)).resolves.toBe(0);

  const run = (await readdir(join(home, "runs"))).find((name) => !name.endsWith(".lock")) ?? "";
  const cache = join(root, "cache");
  const perRun = scratchRun(cache, home, run);
  const attempt = join(perRun, (await readdir(perRun))[0] ?? "");
  // Every level, from the one the cache root makes down to the directory the
  // agent was handed as `$INPUT`. RED on main at 777 for all six.
  for (const path of [join(cache, "bot"), join(cache, "bot", "tmp"), dirname(perRun), perRun, attempt, join(attempt, "input")]) {
    await expect(permissions(path), path).resolves.toBe("700");
  }
});

// LEG 1's other half. A clone is somebody else's tree arriving on this machine
// and it lands in the same cache; `mkdtemp` mints the staging directory itself
// at 0700 (POSIX), so what needed the mode is the level it is minted IN — which
// nothing made owner-only, and which the clone then filled world-readable.
test("the level a git install stages its clone in is born owner-only", async () => {
  permissive();
  const { root, home } = await roots.scratch("bot-scratch-private-install-");
  const work = join(root, "git-work", "review");
  await reviewAssembly(work);
  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: join(root, "git-work"), env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } });
  };
  git("init", "--quiet", "--initial-branch", "main");
  git("config", "user.email", "corpus@example.invalid");
  git("config", "user.name", "Corpus");
  git("add", "-A");
  git("commit", "--quiet", "-m", "first");

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = realBoundary(root, home, stdout, stderr);
  const source = `file://${join(root, "git-work")}#review`;
  await expect(main(["assembly", "install", source, "--name", "review"], held)).resolves.toBe(0);

  // The staging directory is removed by every path out of the install, so what
  // survives to be measured is the level it was made in — this home's own.
  await expect(permissions(homeScratch(join(root, "cache"), home))).resolves.toBe("700");
});
