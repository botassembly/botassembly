// Ticket 0137 — `bot assembly install` tells the truth about what it copied.
//
// Observed before anything changed, through the real CLI, in three faces of one
// fault:
// - `install ./dir-with-no-ASSEMBLY.md` exited 0 saying "NAME installed from
//   ./NAME"; `bot assembly` then listed nothing, `bot status` counted 0, and
//   `bot assembly remove NAME` refused `assembly-unknown` / "Name an assembly
//   the home holds." — litter no verb could take away.
// - `install ./somefile` exited 2 with a bare Node string (`ENOTDIR: not a
//   directory, open '<home>/assemblies/NAME/.bot-source'`) — no code, no
//   sentence — and left the copied FILE standing at the name.
// - `install ./repo#subdir` where the subdir holds no `ASSEMBLY.md` was the
//   first face again, through the other door.
//
// Install COPIES, so what it puts at a name is frozen there (management.md);
// a link is read afresh at every read, which is why 0130 left `link`
// permissive and marked. So the predicate is the same one — `assemblyMarker`,
// `ASSEMBLY.md` at the root — and the answer differs: install refuses.
//
// THE CONSTRUCTION THAT LETS THESE FAIL. A refusal that refused everything
// would pass any assertion that only said "this one was refused", so every
// leg below installs something that IS an assembly beside the one that is not
// and asserts that it landed. The no-litter legs read the home's own tree
// rather than `list`, because `list` is exactly the reader that could not see
// this litter in the first place.
//
// Nothing here touches the real ~/.pi, ~/.cache or ~/.local/share: every home
// and every source is under an mkdtemp root, and the boundary pins BOT_HOME and
// XDG_CACHE_HOME inside it. No network: the git leg clones a repository built
// in the same root with the real git binary, over `file://`.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { boundaryFor, cleanup, lines, scratch, text, tree, type Capture } from "./assembly-home.ts";
import { homeScratch } from "./scratch.ts";
import { main } from "../src/cli.ts";

afterEach(cleanup);

/** The refusal a source that is not an assembly earns, whole, on stderr. */
function refusal(source: string): string {
  return `assembly-unknown  ${source}\n  Name an assembly; what is there is not one.\n`;
}

/** A directory that exists and is not an assembly: no `ASSEMBLY.md` anywhere in it. */
async function notAnAssembly(path: string): Promise<string> {
  await mkdir(join(path, "notes"), { recursive: true });
  await writeFile(join(path, "README.md"), "Notes, not an assembly.\n");
  return path;
}

async function held(home: string): Promise<string[]> {
  return (await readdir(join(home, "assemblies"))).sort();
}

test("install — a source directory that is not an assembly is refused, and nothing stands at the name", async () => {
  const scratched = await scratch("bot-install-not-assembly-");
  const source = await notAnAssembly(join(scratched.root, "code", "notes"));
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(scratched.root, scratched.home, capture);

  await expect(main(["assembly", "install", source], boundary)).resolves.toBe(2);
  expect(text(capture.out)).toBe("");
  expect(text(capture.err)).toBe(refusal(source));
  // Read off the tree, not off `list`: `list` is the reader that could not see
  // this litter, so it cannot be the witness that the litter is gone.
  expect(await held(scratched.home)).toEqual([]);

  // The refusal is not a refusal of everything: the assembly beside it installs.
  capture.err.length = 0;
  const good = await tree(join(scratched.root, "code", "review-bot"), "Review.");
  expect(await lines(["assembly", "install", good], boundary, capture, 0))
    .toEqual([`review-bot  installed  from ${good}`]);
  expect(await held(scratched.home)).toEqual(["review-bot"]);
  expect(text(capture.err)).toBe("");
});

test("install — a FILE is refused in two lines, with no raw Node text and no copy left behind", async () => {
  const scratched = await scratch("bot-install-file-");
  const source = join(scratched.root, "somefile");
  await writeFile(source, "not an assembly, not even a folder\n");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(scratched.root, scratched.home, capture);

  await expect(main(["assembly", "install", source], boundary)).resolves.toBe(2);
  expect(text(capture.out)).toBe("");
  // The shape 0075/0081 hunted out of runs and status: a raw errno string is
  // not a refusal — no code, no path, nothing a person can act on.
  expect(text(capture.err)).not.toContain("ENOTDIR");
  expect(text(capture.err)).toBe(refusal(source));
  expect(await held(scratched.home)).toEqual([]);
  expect(existsSync(join(scratched.home, "assemblies", "somefile"))).toBe(false);
});

test("install — a #subdir that is not an assembly is refused; the sibling that is one still installs", async () => {
  const scratched = await scratch("bot-install-subdir-not-assembly-");
  const repo = join(scratched.root, "code", "bots");
  await notAnAssembly(join(repo, "notes"));
  await tree(join(repo, "review"), "Review.");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(scratched.root, scratched.home, capture);

  await expect(main(["assembly", "install", `${repo}#notes`], boundary)).resolves.toBe(2);
  expect(text(capture.err)).toBe(refusal(`${repo}#notes`));
  expect(await held(scratched.home)).toEqual([]);

  capture.err.length = 0;
  expect(await lines(["assembly", "install", `${repo}#review`], boundary, capture, 0))
    .toEqual([`review  installed  from ${repo}#review`]);
  expect(await held(scratched.home)).toEqual(["review"]);

  // The repository root holds two folders and is not itself an assembly: the
  // same refusal, through the door with no `#` in it.
  capture.err.length = 0;
  await expect(main(["assembly", "install", repo, "--name", "bots"], boundary)).resolves.toBe(2);
  expect(text(capture.err)).toBe(refusal(repo));
  expect(await held(scratched.home)).toEqual(["review"]);
});

test("install — a refused install leaves the home as it found it: no namespace directory, and no home it had to make", async () => {
  const scratched = await scratch("bot-install-no-litter-");
  const source = await notAnAssembly(join(scratched.root, "code", "notes"));
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(scratched.root, scratched.home, capture);

  // A nested name makes its parent directories real (management.md) — but only
  // for an install that happens. A refused one used to leave `team/` standing,
  // and no verb takes an empty namespace away.
  await expect(main(["assembly", "install", source, "--name", "team/triage"], boundary)).resolves.toBe(2);
  expect(await held(scratched.home)).toEqual([]);
  // The same for a source that is not there at all: the refusal changed, the
  // near tree did not.
  capture.err.length = 0;
  await expect(main(["assembly", "install", "./nowhere", "--name", "team/triage"], boundary)).resolves.toBe(2);
  expect(text(capture.err)).toBe("path-missing  ./nowhere\n  Name a folder that exists or a source git can clone.\n");
  expect(await held(scratched.home)).toEqual([]);

  // A home that did not exist is not conjured by an install that refuses; one
  // that installs makes it, so this is not a home that can never be made.
  const unmade = join(scratched.root, "unmade-home");
  const elsewhere = boundaryFor(scratched.root, unmade, capture);
  capture.err.length = 0;
  await expect(main(["assembly", "install", source], elsewhere)).resolves.toBe(2);
  expect(existsSync(unmade)).toBe(false);

  capture.out.length = 0;
  const good = await tree(join(scratched.root, "code", "review-bot"), "Review.");
  await expect(main(["assembly", "install", good], elsewhere)).resolves.toBe(0);
  expect(await held(unmade)).toEqual(["review-bot"]);
});

test("install — a git source is judged after the clone: refused, home untouched, no clone left in scratch", async () => {
  const scratched = await scratch("bot-install-git-not-assembly-");
  const work = await notAnAssembly(join(scratched.root, "git-work"));
  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: work, env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } });
  };
  git("init", "--quiet", "--initial-branch", "main");
  git("config", "user.email", "corpus@example.invalid");
  git("config", "user.name", "Corpus");
  git("add", "-A");
  git("commit", "--quiet", "-m", "first");
  const source = `file://${work}`;
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(scratched.root, scratched.home, capture);

  // A clone can only be judged once it is fetched — and it is fetched into the
  // scratch the runtime owns, so the home is untouched all the same.
  await expect(main(["assembly", "install", source, "--name", "notes"], boundary)).resolves.toBe(2);
  expect(text(capture.err)).toBe(refusal(source));
  expect(await held(scratched.home)).toEqual([]);
  // Since ticket 0140 the staging directory hangs under THIS home's level of
  // the tree, so that is where a leaked clone would show; the level itself is
  // made on the way and stays, holding nothing.
  const tmp = homeScratch(join(scratched.root, "cache"), scratched.home);
  expect(existsSync(tmp) ? await readdir(tmp) : []).toEqual([]);
});

test("update — a source that has stopped being an assembly refuses, and the installed copy still stands", async () => {
  const scratched = await scratch("bot-update-not-assembly-");
  const source = await tree(join(scratched.root, "code", "review-bot"), "Review.");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(scratched.root, scratched.home, capture);
  await lines(["assembly", "install", source], boundary, capture, 0);

  // The source is edited into something that is no longer an assembly. An
  // update that copied it would replace a working assembly with litter — the
  // same fault as the install, one verb further on.
  await rm(join(source, "ASSEMBLY.md"));
  await expect(main(["assembly", "update", "review-bot"], boundary)).resolves.toBe(2);
  expect(text(capture.err)).toBe(refusal(await realpath(source)));
  // "a fetch that fails leaves what was already installed intact" (management.md).
  expect(await held(scratched.home)).toEqual(["review-bot"]);
  capture.err.length = 0;
  expect(await lines(["assembly", "list"], boundary, capture, 0))
    .toEqual([`review-bot  installed  from ${await realpath(source)}  updated 2026-08-02T12:00:00.000Z`]);
});
