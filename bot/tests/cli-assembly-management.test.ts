// Ticket 0031 — `bot assembly`, every verb end to end through main() with the
// injected CliBoundary and a mkdtemp home. The assertion source is the new
// element specification/elements/management.md:
// - "one record per line on stdout, in a stable field order, diagnostics on
//   stderr, and every answer read off the disk rather than out of an index"
// - "Installed is a real directory under `assemblies/` ... Linked is a symbolic
//   link standing at the assembly's name under `assemblies/` — a nested name
//   makes its parent directories real, and the link stands at the leaf —
//   pointing at a working tree somewhere else" (0063 item 6)
// - "A link whose target is not an assembly — gone, or never one — is broken.
//   `list` says so, `link` says so of the link it has just made, and a run of
//   it refuses `assembly-unknown` ... never silently skipped" (0130 widened
//   this from "whose target has gone"; the marked legs live in link-truth.test.ts)
// - "`.bot-source` holds the source on its first line and the time of the last
//   fetch on its second"
// - "A name the home already holds is refused, never overwritten"
// - "Where there is no `git` to run, the install refuses and says to install it"
// - "A linked assembly is already live and says so. An assembly with no
//   `.bot-source` ... updating it by name refuses rather than guessing"
// - "It never removes what a link pointed at"
// - "An assembly a run is still using is not swapped or taken away underneath
//   it: while a run of it is live, `update` and `remove` refuse and say to
//   wait ... a run that died holds nothing" (0063 item 1)
//
// No network, ever: the git legs clone from a LOCAL bare repository built in
// the scratch root with the real git binary, and the no-git leg injects a PATH
// that holds no git at all.
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import { chmod, mkdir, readFile, readdir, realpath, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { boundaryFor, cleanup, lines, scratch, text, tree, type Capture } from "./assembly-home.ts";
import { main } from "../src/cli.ts";

afterEach(cleanup);

// ─── list ────────────────────────────────────────────────────────────────────

test("list — installed, nested, linked, and a broken link, one line each; the bare noun lists", async () => {
  const held = await scratch("bot-assembly-list-");
  await tree(join(held.home, "assemblies", "review"), "Review.");
  await tree(join(held.home, "assemblies", "team", "triage"), "Triage.");
  await writeFile(join(held.home, "assemblies", "review", ".bot-source"), "https://example.invalid/bots#review\n2026-08-01T09:12:44.000Z\n");
  const live = await tree(join(held.root, "code", "dev-bot"), "Dev.");
  await symlink(live, join(held.home, "assemblies", "dev-bot"));
  await symlink(join(held.root, "code", "gone"), join(held.home, "assemblies", "old-bot"));

  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);
  const listed = await lines(["assembly", "list"], boundary, capture, 0);
  expect(listed).toEqual([
    `dev-bot  linked  -> ${live}`,
    `old-bot  linked  -> ${join(held.root, "code", "gone")}  BROKEN`,
    "review  installed  from https://example.invalid/bots#review  updated 2026-08-01T09:12:44.000Z",
    "team/triage  installed  local copy",
  ]);
  expect(text(capture.err)).toBe("");

});

test("explicit list returns an empty valid page and update reports absence", async () => {
  const held = await scratch("bot-assembly-empty-");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);
  expect(await lines(["assembly", "list"], boundary, capture, 0)).toEqual(["No assemblies match."]);
  expect(text(capture.err)).toBe("");
  expect(await lines(["assembly", "update"], boundary, capture, 1)).toEqual([]);
  expect(text(capture.err)).toBe("This home has no assemblies.\n");
});

// ─── link ────────────────────────────────────────────────────────────────────

test("link — the editable install: a symlink at the name, the live tree runs, remove takes back only the link", async () => {
  const held = await scratch("bot-assembly-link-");
  const live = await tree(join(held.root, "code", "dev-bot"), "Dev.");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);

  expect(await lines(["assembly", "link", live], boundary, capture, 0)).toEqual([`dev-bot  linked  -> ${live}`]);
  expect(await lines(["assembly", "list"], boundary, capture, 0)).toEqual([`dev-bot  linked  -> ${live}`]);

  // The link is live: an edit to the tree is what `bot check` reads through it.
  await writeFile(join(live, "flows", "main", "01-work.md"), "---\nintelligence: high\n---\nDo the work.\n");
  await writeFile(join(held.home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n  high: { provider: faux, model: faux-1, reasoning: high }\n");
  const checked = await lines(["assembly", "check", "dev-bot/main", "--json"], boundary, capture, 0);
  expect(checked.join("\n")).toContain('"reasoning":{"value":"high","from":"stage"}');

  // Removal unlinks and never touches the target.
  expect(await lines(["assembly", "remove", "dev-bot"], boundary, capture, 0)).toEqual(["dev-bot  removed"]);
  expect(existsSync(join(held.home, "assemblies", "dev-bot"))).toBe(false);
  await expect(readFile(join(live, "ASSEMBLY.md"), "utf8")).resolves.toContain("Dev.");
});

test("link — --name nests the name, and a name the home already holds is refused, never overwritten", async () => {
  const held = await scratch("bot-assembly-collision-");
  const live = await tree(join(held.root, "code", "dev-bot"), "Dev.");
  const other = await tree(join(held.root, "code", "other"), "Other.");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);

  expect(await lines(["assembly", "link", live, "--name", "team/dev"], boundary, capture, 0))
    .toEqual([`team/dev  linked  -> ${live}`]);

  // The shape the name makes on disk (home.md, management.md, 0063 item 6): the
  // nested name's parent is a REAL directory, and the link stands at the leaf.
  const parent = lstatSync(join(held.home, "assemblies", "team"));
  expect([parent.isDirectory(), parent.isSymbolicLink()]).toEqual([true, false]);
  expect(lstatSync(join(held.home, "assemblies", "team", "dev")).isSymbolicLink()).toBe(true);

  await expect(main(["assembly", "link", other, "--name", "team/dev"], boundary)).resolves.toBe(2);
  expect(text(capture.out)).toBe("");
  expect(text(capture.err)).toBe("request-invalid  team/dev\n  Remove the assembly of that name first; install never overwrites.\n");
  // The first link still stands, pointing where it always did.
  capture.err.length = 0;
  expect(await lines(["assembly", "list"], boundary, capture, 0)).toEqual([`team/dev  linked  -> ${live}`]);
});

test("link — a path that does not exist refuses path-missing", async () => {
  const held = await scratch("bot-assembly-link-missing-");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);
  await expect(main(["assembly", "link", join(held.root, "nowhere")], boundary)).resolves.toBe(2);
  expect(text(capture.err)).toContain("path-missing");
});

test("install and link — dot locators use the current directory basename", async () => {
  const installed = await scratch("bot-assembly-install-dot-");
  const installSource = await tree(join(installed.root, "team", "review"), "Review.");
  const installCapture: Capture = { out: [], err: [] };
  const installBoundary = boundaryFor(installSource, installed.home, installCapture);
  expect(await lines(["assembly", "install", "."], installBoundary, installCapture, 0))
    .toEqual(["review  installed  from ."]);
  await expect(readFile(join(installed.home, "assemblies", "review", ".bot-source"), "utf8"))
    .resolves.toBe(`${await realpath(installSource)}\n2026-08-02T12:00:00.000Z\n`);

  const slashed = await scratch("bot-assembly-install-dot-slash-");
  const slashedSource = await tree(join(slashed.root, "team", "review"), "Review.");
  const slashedCapture: Capture = { out: [], err: [] };
  const slashedBoundary = boundaryFor(slashedSource, slashed.home, slashedCapture);
  expect(await lines(["assembly", "install", "./"], slashedBoundary, slashedCapture, 0))
    .toEqual(["review  installed  from ./"]);
  await expect(readFile(join(slashed.home, "assemblies", "review", "ASSEMBLY.md"), "utf8"))
    .resolves.toContain("Review.");

  const linked = await scratch("bot-assembly-link-dot-");
  const linkSource = await tree(join(linked.root, "team", "review"), "Review.");
  const linkCapture: Capture = { out: [], err: [] };
  const linkBoundary = boundaryFor(linkSource, linked.home, linkCapture);
  expect(await lines(["assembly", "link", "."], linkBoundary, linkCapture, 0))
    .toEqual([`review  linked  -> ${linkSource}`]);
  await expect(realpath(join(linked.home, "assemblies", "review"))).resolves.toBe(await realpath(linkSource));

  const explicit = await scratch("bot-assembly-install-dot-name-");
  const explicitSource = await tree(join(explicit.root, "team", "review"), "Review.");
  const explicitCapture: Capture = { out: [], err: [] };
  const explicitBoundary = boundaryFor(explicitSource, explicit.home, explicitCapture);
  expect(await lines(["assembly", "install", ".", "--name", "team/review"], explicitBoundary, explicitCapture, 0))
    .toEqual(["team/review  installed  from ."]);
  expect(existsSync(join(explicit.home, "assemblies", "team", "review"))).toBe(true);

  const ordinary = await scratch("bot-assembly-install-ordinary-name-");
  const ordinaryParent = join(ordinary.root, "parent");
  await tree(join(ordinaryParent, "tumor-board"), "Review.");
  const ordinaryCapture: Capture = { out: [], err: [] };
  const ordinaryBoundary = boundaryFor(ordinaryParent, ordinary.home, ordinaryCapture);
  expect(await lines(["assembly", "install", "./tumor-board"], ordinaryBoundary, ordinaryCapture, 0))
    .toEqual(["tumor-board  installed  from ./tumor-board"]);
  expect(existsSync(join(ordinary.home, "assemblies", "tumor-board"))).toBe(true);
});

// ─── install (local) ─────────────────────────────────────────────────────────

test("install — a local path is copied in, provenance records it, and the copy is independent of the source", async () => {
  const held = await scratch("bot-assembly-install-local-");
  const source = await tree(join(held.root, "code", "review-bot"), "Review.");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);

  expect(await lines(["assembly", "install", source], boundary, capture, 0))
    .toEqual([`review-bot  installed  from ${source}`]);

  const installed = join(held.home, "assemblies", "review-bot");
  await expect(readFile(join(installed, "ASSEMBLY.md"), "utf8")).resolves.toContain("Review.");
  // management.md: ".bot-source holds the source on its first line and the time
  // of the last fetch on its second."
  await expect(readFile(join(installed, ".bot-source"), "utf8")).resolves.toBe(`${await realpath(source)}\n2026-08-02T12:00:00.000Z\n`);
  expect(await lines(["assembly", "list"], boundary, capture, 0))
    .toEqual([`review-bot  installed  from ${await realpath(source)}  updated 2026-08-02T12:00:00.000Z`]);

  // "nothing outside can change what runs": editing the source does not reach
  // the installed copy.
  await writeFile(join(source, "ASSEMBLY.md"), "---\nintelligence: default\n---\nEdited.\n");
  await expect(readFile(join(installed, "ASSEMBLY.md"), "utf8")).resolves.toContain("Review.");

  // The dotfile is invisible to the reader: the installed copy still checks.
  expect((await lines(["assembly", "check", "review-bot/main", "--json"], boundary, capture, 0)).length).toBe(1);
});

test("install — --name refuses a flag or missing value and accepts a name", async () => {
  const held = await scratch("bot-assembly-install-name-");
  const source = await tree(join(held.root, "code", "review-bot"), "Review.");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);

  await expect(main(["assembly", "install", source, "--name", "--something"], boundary)).resolves.toBe(2);
  expect(text(capture.err)).toBe("request-invalid  --something\n  Name an assembly that does not begin with a hyphen.\n");
  capture.err.length = 0;
  await expect(main(["assembly", "install", source, "--name"], boundary)).resolves.toBe(2);
  expect(text(capture.err)).toBe("request-invalid  --name\n  Supply a value for --name.\n");
  capture.err.length = 0;

  expect(await lines(["assembly", "install", source, "--name", "team/review"], boundary, capture, 0))
    .toEqual([`team/review  installed  from ${source}`]);
});

test("install — a local path with #subdir names the folder inside it, and the last segment is the name", async () => {
  const held = await scratch("bot-assembly-install-subdir-");
  const repo = join(held.root, "code", "bots");
  await tree(join(repo, "review"), "Review.");
  await tree(join(repo, "triage"), "Triage.");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);

  expect(await lines(["assembly", "install", `${repo}#review`], boundary, capture, 0))
    .toEqual([`review  installed  from ${repo}#review`]);
  await expect(readFile(join(held.home, "assemblies", "review", "ASSEMBLY.md"), "utf8")).resolves.toContain("Review.");
  expect(existsSync(join(held.home, "assemblies", "triage"))).toBe(false);
});

test("install — a #subdir that the source does not hold refuses path-missing and installs nothing", async () => {
  const held = await scratch("bot-assembly-install-nosubdir-");
  const repo = join(held.root, "code", "bots");
  await tree(join(repo, "review"), "Review.");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);
  await expect(main(["assembly", "install", `${repo}#absent`], boundary)).resolves.toBe(2);
  expect(text(capture.err)).toContain("path-missing");
  await expect(readdir(join(held.home, "assemblies"))).resolves.toEqual([]);
});

// Ticket 0128 — REDESIGN of "Name a source git can clone.", which answered the
// URL half of `install` to a reader who had typed a path. One source argument
// is tried as a folder here and then as something git can clone, so the fault
// is one fault and the sentence covers both halves of it.
test("install — a source that is neither a folder here nor a repository git can clone says both halves", async () => {
  const held = await scratch("bot-assembly-install-nosource-");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);
  await expect(main(["assembly", "install", "./nowhere"], boundary)).resolves.toBe(2);
  expect(text(capture.err)).toBe("path-missing  ./nowhere\n  Name a folder that exists or a source git can clone.\n");
  await expect(readdir(join(held.home, "assemblies"))).resolves.toEqual([]);
});

// ─── install (git) ───────────────────────────────────────────────────────────

/** A LOCAL bare repository holding two assemblies, built with the real git binary. */
async function bareRepository(root: string): Promise<string> {
  const work = join(root, "git-work");
  await tree(join(work, "review"), "Review v1.");
  await tree(join(work, "triage"), "Triage v1.");
  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: work, env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } });
  };
  git("init", "--quiet", "--initial-branch", "main");
  git("config", "user.email", "corpus@example.invalid");
  git("config", "user.name", "Corpus");
  git("add", "-A");
  git("commit", "--quiet", "-m", "first");
  const bare = join(root, "bots.git");
  execFileSync("git", ["clone", "--quiet", "--bare", work, bare]);
  return bare;
}

test("install — a git URL with #subdir shallow-clones, copies the subdir out, records provenance, and leaves no clone behind", async () => {
  const held = await scratch("bot-assembly-install-git-");
  const source = `file://${await bareRepository(held.root)}#review`;
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);

  expect(await lines(["assembly", "install", source], boundary, capture, 0))
    .toEqual([`review  installed  from ${source}`]);
  const installed = join(held.home, "assemblies", "review");
  await expect(readFile(join(installed, "ASSEMBLY.md"), "utf8")).resolves.toContain("Review v1.");
  await expect(readFile(join(installed, ".bot-source"), "utf8")).resolves.toBe(`${source}\n2026-08-02T12:00:00.000Z\n`);
  // The clone was scratch: no .git rides along into the home.
  expect(existsSync(join(installed, ".git"))).toBe(false);
  expect(existsSync(join(held.home, "assemblies", "triage"))).toBe(false);
  // The copy is an assembly the reader accepts.
  expect((await lines(["assembly", "check", "review/main", "--json"], boundary, capture, 0)).length).toBe(1);
});

test("install — no git on PATH refuses honestly and names the fix; nothing lands in the home", async () => {
  const held = await scratch("bot-assembly-install-nogit-");
  const empty = join(held.root, "no-tools");
  await mkdir(empty, { recursive: true });
  const capture: Capture = { out: [], err: [] };
  // A PATH that holds no git at all, injected — the only PATH the spawn sees.
  const boundary = boundaryFor(held.root, held.home, capture, { PATH: empty });

  await expect(main(["assembly", "install", "https://example.invalid/bots.git#review"], boundary)).resolves.toBe(2);
  expect(text(capture.out)).toBe("");
  expect(text(capture.err)).toBe("tool-missing  git\n  Install git and put it on PATH; installing from a git source runs it.\n");
  await expect(readdir(join(held.home, "assemblies"))).resolves.toEqual([]);
});

test("install — an incomplete git capture reports machinery failure rather than a missing source", async () => {
  const held = await scratch("bot-assembly-install-incomplete-capture-");
  const tools = join(held.root, "tools"), git = join(tools, "git"), escapedPid = join(held.root, "escaped.pid");
  await mkdir(tools);
  await writeFile(git, [
    `#!${process.execPath}`,
    'import { spawn } from "node:child_process";',
    'import { mkdirSync, writeFileSync } from "node:fs";',
    'const root = process.argv.at(-1);',
    'mkdirSync(`${root}/.git`, { recursive: true });',
    'writeFileSync(`${root}/ASSEMBLY.md`, "---\\nintelligence: default\\n---\\nFetched.\\n");',
    'const child = spawn("/bin/sleep", ["10"], { detached: true, stdio: ["ignore", process.stdout, process.stderr] });',
    'writeFileSync(process.env.ESCAPED_PID, String(child.pid));',
    'child.unref();',
  ].join("\n"));
  await chmod(git, 0o755);
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture, { PATH: tools, ESCAPED_PID: escapedPid });
  let escaped: number | undefined;
  try {
    await expect(main(["assembly", "install", "https://example.invalid/review.git"], boundary))
      .rejects.toThrow("Git clone did not close its captured output after exiting.");
    escaped = Number(await readFile(escapedPid, "utf8"));
    expect(text(capture.err)).not.toContain("path-missing");
    await expect(readdir(join(held.home, "assemblies"))).resolves.toEqual([]);
  } finally {
    if (escaped !== undefined) { try { process.kill(-escaped, "SIGKILL"); } catch { /* already gone */ } }
  }
});

// ─── update ──────────────────────────────────────────────────────────────────

test("update — re-fetches from provenance and replaces the copy; the old bytes are gone and the new ones are there", async () => {
  const held = await scratch("bot-assembly-update-");
  const bare = await bareRepository(held.root);
  const source = `file://${bare}#review`;
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);
  await lines(["assembly", "install", source], boundary, capture, 0);

  // The repository moves on.
  const work = join(held.root, "git-work");
  await writeFile(join(work, "review", "ASSEMBLY.md"), "---\nintelligence: default\n---\nReview v2.\n");
  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: work, env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } });
  };
  git("commit", "--quiet", "-am", "second");
  git("push", "--quiet", bare, "main");

  expect(await lines(["assembly", "update", "review"], boundary, capture, 0))
    .toEqual([`review  installed  updated from ${source}`]);
  const installed = join(held.home, "assemblies", "review");
  const manifest = await readFile(join(installed, "ASSEMBLY.md"), "utf8");
  expect(manifest).toContain("Review v2.");
  expect(manifest).not.toContain("Review v1.");
  // Nothing staged is left beside it.
  await expect(readdir(join(held.home, "assemblies"))).resolves.toEqual(["review"]);
});

test("update — a linked assembly is already live; an installed copy with no provenance refuses by name", async () => {
  const held = await scratch("bot-assembly-update-refusals-");
  const live = await tree(join(held.root, "code", "dev-bot"), "Dev.");
  await symlink(live, join(held.home, "assemblies", "dev-bot"));
  await tree(join(held.home, "assemblies", "hand-made"), "By hand.");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);

  expect(await lines(["assembly", "update", "dev-bot"], boundary, capture, 0))
    .toEqual(["dev-bot  linked  already live"]);

  await expect(main(["assembly", "update", "hand-made"], boundary)).resolves.toBe(2);
  expect(text(capture.err)).toBe("source-unknown  hand-made\n  This assembly has no .bot-source; there is nothing to fetch.\n");
  capture.err.length = 0;

  await expect(main(["assembly", "update", "absent"], boundary)).resolves.toBe(2);
  expect(text(capture.err)).toContain("assembly-unknown");
});

test("update — with no name it reports every assembly the home holds", async () => {
  const held = await scratch("bot-assembly-update-all-");
  const live = await tree(join(held.root, "code", "dev-bot"), "Dev.");
  await symlink(live, join(held.home, "assemblies", "dev-bot"));
  await tree(join(held.home, "assemblies", "hand-made"), "By hand.");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);
  expect(await lines(["assembly", "update"], boundary, capture, 0)).toEqual([
    "dev-bot  linked  already live",
    "hand-made  installed  local copy, nothing to fetch",
  ]);
});

// ─── remove ──────────────────────────────────────────────────────────────────

test("remove — an installed copy goes; a name the home does not hold refuses assembly-unknown", async () => {
  const held = await scratch("bot-assembly-remove-");
  await tree(join(held.home, "assemblies", "team", "triage"), "Triage.");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);

  expect(await lines(["assembly", "remove", "team/triage"], boundary, capture, 0)).toEqual(["team/triage  removed"]);
  expect(existsSync(join(held.home, "assemblies", "team", "triage"))).toBe(false);

  await expect(main(["assembly", "remove", "team/triage"], boundary)).resolves.toBe(2);
  expect(text(capture.err)).toBe("assembly-unknown  team/triage\n  Name an assembly the home holds.\n");
});

// Ticket 0071. management.md's contract is "`bot assembly remove <name>` takes
// ONE out of the home" and "Removal that takes back only what installation put
// there". A namespace directory is not an assembly and was never installed, so
// naming one is `assembly-unknown` — not a recursive delete of everything under
// it. What installation DID put there is the nested name's parent directories,
// and an emptied one goes back with the leaf.
test("remove — a namespace is not an assembly: the name must be an exact leaf", async () => {
  const held = await scratch("bot-assembly-remove-namespace-");
  await tree(join(held.home, "assemblies", "team", "triage"), "Triage.");
  await tree(join(held.home, "assemblies", "team", "review"), "Review.");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);

  await expect(main(["assembly", "remove", "team"], boundary)).resolves.toBe(2);
  expect(text(capture.err)).toBe("assembly-unknown  team\n  Name an assembly the home holds.\n");
  expect(text(capture.out)).toBe("");
  capture.err.length = 0;
  // Both assemblies under the namespace are untouched, on disk and to the reader.
  expect(await lines(["assembly", "list"], boundary, capture, 0))
    .toEqual(["team/review  installed  local copy", "team/triage  installed  local copy"]);
  expect((await lines(["assembly", "check", "team/triage/main", "--json"], boundary, capture, 0)).length).toBe(1);

  // The leaf goes by its own name, and its sibling keeps the namespace alive.
  expect(await lines(["assembly", "remove", "team/triage"], boundary, capture, 0)).toEqual(["team/triage  removed"]);
  await expect(readdir(join(held.home, "assemblies", "team"))).resolves.toEqual(["review"]);

  // The last leaf takes the now-empty namespace with it: removal gives back
  // exactly the directories installation made real, and no more.
  expect(await lines(["assembly", "remove", "team/review"], boundary, capture, 0)).toEqual(["team/review  removed"]);
  await expect(readdir(join(held.home, "assemblies"))).resolves.toEqual([]);
  expect(text(capture.err)).toBe("");
});

test("remove — a broken link is removable, and a name that escapes the home is refused", async () => {
  const held = await scratch("bot-assembly-remove-broken-");
  await symlink(join(held.root, "code", "gone"), join(held.home, "assemblies", "old-bot"));
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);

  expect(await lines(["assembly", "remove", "old-bot"], boundary, capture, 0)).toEqual(["old-bot  removed"]);
  await expect(readdir(join(held.home, "assemblies"))).resolves.toEqual([]);

  await expect(main(["assembly", "remove", "../../etc"], boundary)).resolves.toBe(2);
  expect(text(capture.err)).toContain("request-invalid");
});

// ─── dispatch and help ───────────────────────────────────────────────────────

test("dispatch rejects an unknown action and exact command help works", async () => {
  const held = await scratch("bot-assembly-dispatch-");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);

  await expect(main(["assembly", "frobnicate"], boundary)).resolves.toBe(2);
  expect(text(capture.err)).toContain("request-invalid  assembly");
  capture.err.length = 0;

  await expect(main(["assembly", "list", "--help"], boundary)).resolves.toBe(0);
  const screen = text(capture.out);
  expect(screen).toContain("usage: bot assembly list");
});
