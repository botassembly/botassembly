// Ticket 0134: the project lifecycle is copied from SDLC, not locally forked.
// The committed provenance fixes this adoption to a reviewed canonical set.
// The fixture below exercises the dangerous difference directly: a Git-created,
// unregistered worktree belonging to this repository is recoverable, while
// lookalikes remain untouched.
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";

const PROJECT = fileURLToPath(new URL("../../sdlc/project/", import.meta.url));
const TASKS = join(PROJECT, "tasks");
const BEFORE = join(PROJECT, "before");
const SUCCESS = join(PROJECT, "success");
const SCRIPTS = ["tasks", "before", "success", "failure", "health"] as const;
const CANONICAL_PROVENANCE_SHA256 = "74359b3bb4efab8c1cbfa36262da1ad67f0fc1b76bdfaf731383b14ff81c6e1d";

type ScriptProvenance = { sha256: string; executable: boolean };
type Provenance =
  | { sdlc_commit: string; scripts: Record<string, ScriptProvenance> }
  | { canonicalCommit: string; scripts: Array<ScriptProvenance & { name: string }> };

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

interface Fixture {
  root: string;
  origin: string;
  repo: string;
  worktrees: string;
  path: string;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "botassembly-project-script-"));
  roots.push(root);
  const origin = join(root, "origin.git");
  const repo = join(root, "repo");
  const bin = join(root, "bin");
  git(root, ["init", "--bare", "--initial-branch=main", origin]);
  git(root, ["clone", "--quiet", origin, repo]);
  git(repo, ["config", "user.email", "project-script@example.test"]);
  git(repo, ["config", "user.name", "Project script test"]);
  mkdirSync(join(repo, "sdlc", "project"), { recursive: true });
  mkdirSync(join(repo, "sdlc", "scripts"), { recursive: true });
  cpSync(TASKS, join(repo, "sdlc", "project", "tasks"));
  cpSync(BEFORE, join(repo, "sdlc", "project", "before"));
  cpSync(SUCCESS, join(repo, "sdlc", "project", "success"));
  for (const gate of ["lint", "test"]) {
    const path = join(repo, "sdlc", "scripts", gate);
    writeFileSync(path, "#!/bin/sh\nexit 0\n");
    chmodSync(path, 0o755);
  }
  git(repo, ["add", "."]);
  git(repo, ["commit", "--quiet", "-m", "fixture: add lifecycle scripts"]);
  git(repo, ["push", "--quiet", "-u", "origin", "main"]);
  mkdirSync(bin);
  const bot = join(bin, "bot");
  writeFileSync(bot, "#!/bin/sh\nexit 1\n");
  chmodSync(bot, 0o755);
  return { root, origin, repo, worktrees: join(root, "worktrees"), path: `${bin}:${process.env.PATH ?? ""}` };
}

function runTasks(held: Fixture, path: string) {
  return spawnSync(join(held.repo, "sdlc", "project", "tasks"), [], {
    cwd: held.repo,
    encoding: "utf8",
    env: { ...process.env, PATH: path },
  });
}

function pathWithFetchFailures(held: Fixture, failures: Array<{ status: number; stderr: string }>, calls: string): string {
  const bin = join(held.root, "fetch-failure-bin");
  mkdirSync(bin);
  const timeout = execFileSync("sh", ["-c", "command -v timeout"], { encoding: "utf8" }).trim();
  const cases = failures.map(({ status, stderr }, index) => {
    const attempt = String(index + 1);
    const output = join(held.root, `fetch-failure-${attempt}.stderr`);
    writeFileSync(output, stderr);
    return `  ${attempt}) cat ${JSON.stringify(output)} >&2; exit ${String(status)} ;;`;
  }).join("\n");
  const command = join(bin, "timeout");
  writeFileSync(command, `#!/bin/sh
count=0
if [ -f ${JSON.stringify(calls)} ]; then count=$(cat ${JSON.stringify(calls)}); fi
count=$((count + 1))
printf '%s\\n' "$count" > ${JSON.stringify(calls)}
case "$count" in
${cases}
esac
exec ${JSON.stringify(timeout)} "$@"
`);
  chmodSync(command, 0o755);
  return `${bin}:${held.path}`;
}

function runBefore(held: Fixture, id: string) {
  return spawnSync(join(held.repo, "sdlc", "project", "before"), [], {
    cwd: held.repo,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: held.path,
      TICKET_ID: id,
      TICKET_REF: `sdlc/tickets/${id}-fixture.md`,
      TICKET_FLOW: "build",
      WORKTREE_ROOT: held.worktrees,
    },
  });
}

function preparedTree(held: Fixture, id: string): string {
  const prepared = runBefore(held, id);
  expect(prepared.status).toBe(0);
  const match = /^dir: (.+)$/m.exec(prepared.stdout);
  if (match === null || match[1] === undefined) throw new Error("before did not report its worktree");
  return match[1];
}

function unregisteredOwnedTree(held: Fixture, id: string): string {
  const tree = preparedTree(held, id);
  const marker = join(tree, "ORPHAN_MARKER");
  writeFileSync(marker, "remove only if the Git pointer proves ownership\n");
  chmodSync(tree, 0o555);
  try {
    expect(spawnSync("git", ["-C", held.repo, "worktree", "remove", "--force", tree], { encoding: "utf8" }).status).not.toBe(0);
  } finally {
    chmodSync(tree, 0o755);
  }
  expect(existsSync(join(tree, ".git"))).toBe(true);
  return tree;
}

function emptyTree(held: Fixture, id: string): string {
  const tree = preparedTree(held, id);
  git(held.repo, ["worktree", "remove", "--force", tree]);
  expect(existsSync(tree)).toBe(false);
  return tree;
}

function runSuccess(held: Fixture, extra: Record<string, string>) {
  return spawnSync(join(held.repo, "sdlc", "project", "success"), [], {
    cwd: held.repo,
    encoding: "utf8",
    env: { ...process.env, PATH: held.path, ...extra },
  });
}

function landingWitness(held: Fixture, tip: string): Record<string, string> {
  const runId = "witnessed-landing";
  const botHome = join(held.root, "bot-home");
  const run = join(botHome, "runs", runId);
  const capture = "witness.txt", record = join(run, "record.jsonl");
  const bot = join(held.root, "witness-bot");
  mkdirSync(run, { recursive: true });
  writeFileSync(join(run, capture), `verified ${tip}\n`); writeFileSync(record, `${JSON.stringify({ event: "check", check: "gate", file: "flows/build/05-verify/gate/06-witness", exit: 0, capture })}\n`);
  writeFileSync(bot, `#!/bin/sh\n[ "$1" = run ] && [ "$2" = check ] && [ "$3" = ${JSON.stringify(runId)} ] && [ "$4" = gate ] || exit 2\n[ "$5" = --file ] && [ "$6" = flows/build/05-verify/gate/06-witness ] && [ "$7" = --raw ] && [ "$8" = --home ] && [ "$9" = ${JSON.stringify(botHome)} ] || exit 2\ncat ${JSON.stringify(join(run, capture))}\n`);
  chmodSync(bot, 0o755);
  return { BOT_CMD: bot, BOT_HOME: botHome, RUN_ID: runId, TICKET_FLOW: "build" };
}

function landingAttempt(held: Fixture, id: string) {
  const base = git(held.repo, ["rev-parse", "HEAD"]).trim();
  const tree = join(held.root, `attempt-${id}`);
  git(held.repo, ["worktree", "add", "--quiet", "-b", `ticket/${id}`, tree, "origin/main"]);
  writeFileSync(join(tree, "LANDED"), "this candidate awaits checkout activation\n");
  git(tree, ["add", "LANDED"]);
  git(tree, ["commit", "--quiet", "-m", "candidate: await activation"]);
  return { base, tip: git(tree, ["rev-parse", "HEAD"]).trim(), tree };
}

function publishDeploy(held: Fixture, marker: string) {
  const deploy = join(held.repo, "sdlc", "scripts", "deploy");
  writeFileSync(deploy, `#!/bin/sh\nprintf '%s\\n' "$(git rev-parse HEAD)" "$LANDED_BASE" "$LANDED_TIP" > ${JSON.stringify(marker)}\n`);
  chmodSync(deploy, 0o755);
  git(held.repo, ["add", "sdlc/scripts/deploy"]);
  git(held.repo, ["commit", "--quiet", "-m", "fixture: add deploy hook"]);
  git(held.repo, ["push", "--quiet", "origin", "main"]);
}

function scriptProvenance(provenance: Provenance): Record<string, ScriptProvenance> {
  return Array.isArray(provenance.scripts)
    ? Object.fromEntries(provenance.scripts.map(({ name, ...script }) => [name, script]))
    : provenance.scripts;
}

function expectProjectToMatchProvenance(project: string) {
  const provenancePath = join(project, "provenance.json");
  const provenance = JSON.parse(readFileSync(provenancePath, "utf8")) as Provenance;
  const scripts = scriptProvenance(provenance);

  const canonicalCommit = "canonicalCommit" in provenance ? provenance.canonicalCommit : provenance.sdlc_commit;
  expect(canonicalCommit).toMatch(/^[0-9a-f]{40}$/);
  expect(Object.keys(scripts).sort()).toEqual([...SCRIPTS].sort());
  for (const script of SCRIPTS) {
    const path = join(project, script);
    expect(createHash("sha256").update(readFileSync(path)).digest("hex"), script).toBe(scripts[script]?.sha256);
    // Git records the executable bit, while checkout umasks may vary other bits.
    expect((statSync(path).mode & 0o111) !== 0, script).toBe(scripts[script]?.executable);
  }
}

test("all lifecycle scripts match their adopted canonical provenance", () => {
  const provenance = readFileSync(join(PROJECT, "provenance.json"));
  expect(createHash("sha256").update(provenance).digest("hex"), "provenance.json").toBe(CANONICAL_PROVENANCE_SHA256);
  expectProjectToMatchProvenance(PROJECT);
});

test("the provenance witness accepts owner-only executable lifecycle scripts", () => {
  const root = mkdtempSync(join(tmpdir(), "botassembly-project-umask-"));
  roots.push(root);
  const project = join(root, "project");
  cpSync(PROJECT, project, { recursive: true });

  for (const script of SCRIPTS) chmodSync(join(project, script), 0o700);
  for (const script of SCRIPTS) expect(statSync(join(project, script)).mode & 0o777, script).toBe(0o700);

  expectProjectToMatchProvenance(project);
});

test("the provenance witness rejects a copied lifecycle script with no execute bits", () => {
  const root = mkdtempSync(join(tmpdir(), "botassembly-project-umask-"));
  roots.push(root);
  const project = join(root, "project");
  cpSync(PROJECT, project, { recursive: true });

  for (const script of SCRIPTS) chmodSync(join(project, script), 0o700);
  chmodSync(join(project, "tasks"), 0o600);
  expect(statSync(join(project, "tasks")).mode & 0o777).toBe(0o600);

  expect(() => { expectProjectToMatchProvenance(project); }).toThrow();
});

test("the provenance witness rejects a fork and accepts coordinated propagation", () => {
  const root = mkdtempSync(join(tmpdir(), "botassembly-project-provenance-"));
  roots.push(root);
  const project = join(root, "project");
  cpSync(PROJECT, project, { recursive: true });
  const tasks = join(project, "tasks");
  writeFileSync(tasks, Buffer.concat([readFileSync(tasks), Buffer.from("# propagated change\n")]));

  expect(() => { expectProjectToMatchProvenance(project); }).toThrow();

  const provenancePath = join(project, "provenance.json");
  const provenance = JSON.parse(readFileSync(provenancePath, "utf8")) as Provenance;
  const changed = {
    sha256: createHash("sha256").update(readFileSync(tasks)).digest("hex"),
    executable: true,
  };
  if (Array.isArray(provenance.scripts)) {
    const tasksEntry = provenance.scripts.find(({ name }) => name === "tasks");
    if (tasksEntry === undefined) throw new Error("tasks provenance is missing");
    Object.assign(tasksEntry, changed);
  } else {
    provenance.scripts.tasks = changed;
  }
  writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);

  expect(() => { expectProjectToMatchProvenance(project); }).not.toThrow();
});

test("tasks retries one failed fetch and reports the board", () => {
  const held = fixture();
  const calls = join(held.root, "fetch-calls");
  const ticket = "sdlc/tickets/0094-ordinary-retry.md";
  mkdirSync(join(held.repo, "sdlc", "tickets"), { recursive: true });
  writeFileSync(join(held.repo, ticket), "---\nflow: build\npriority: 5\n---\nRetry the refused fetch.\n");
  git(held.repo, ["add", ticket]);
  git(held.repo, ["commit", "--quiet", "-m", "ticket: add ordinary fetch retry fixture"]);
  git(held.repo, ["push", "--quiet", "origin", "main"]);

  const result = runTasks(held, pathWithFetchFailures(held, [
    { status: 1, stderr: "ssh: connect to host example.test port 22: Connection refused\n" },
  ], calls));

  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout)).toMatchObject({ id: "0094", ref: ticket, status: "ready" });
  expect(readFileSync(calls, "utf8").trim()).toBe("2");
});

test("tasks fails closed after two fetch failures with the final bounded reason", () => {
  const held = fixture();
  const calls = join(held.root, "fetch-calls");
  const finalLine = `final refusal\u0007 ${"é".repeat(600)}`;

  const result = runTasks(held, pathWithFetchFailures(held, [
    { status: 1, stderr: "first attempt failed\n" },
    { status: 1, stderr: `discard this line\n${finalLine}\n\n` },
  ], calls));
  const [diagnostic = "", ...remainingLines] = result.stderr.split("\n");

  expect(result.status).toBe(2);
  expect(result.stdout).toBe("");
  expect(diagnostic).toContain("final refusal ");
  expect(diagnostic).not.toContain("first attempt failed");
  expect(diagnostic).not.toContain("discard this line");
  expect(diagnostic).not.toMatch(/[\u0000-\u001f\u007f]/);
  expect(Buffer.byteLength(diagnostic, "utf8")).toBeLessThanOrEqual(1024);
  expect(remainingLines).toEqual([""]);
  expect(readFileSync(calls, "utf8").trim()).toBe("2");
});

test("success reports pending activation and later activates the landed tip", () => {
  const held = fixture();
  const deployed = join(held.root, "deployed");
  publishDeploy(held, deployed);
  const { base, tip, tree } = landingAttempt(held, "0137");
  const local = join(held.repo, "LOCAL");
  writeFileSync(local, "do not overwrite local work\n");

  const pending = runSuccess(held, {
    ATTEMPT_DIR: tree,
    SDLC_BRANCH: "ticket/0137",
    SDLC_REPO: held.repo,
    TICKET_ID: "0137",
    TICKET_REF: "sdlc/tickets/0137-fixture.md",
    ...landingWitness(held, tip),
  });

  expect(pending.status).toBe(4);
  expect(pending.stdout).toBe(`activation-pending ${base}..${tip}\n`);
  expect(git(held.repo, ["rev-parse", "HEAD"]).trim()).toBe(base);
  expect(git(held.repo, ["rev-parse", "origin/main"]).trim()).toBe(tip);
  expect(existsSync(local)).toBe(true);
  expect(existsSync(deployed)).toBe(false);
  expect(existsSync(tree)).toBe(false);

  rmSync(local);
  const activated = runSuccess(held, {
    ACTIVATION_BASE: base,
    ACTIVATION_TIP: tip,
    SDLC_REPO: held.repo,
  });

  expect(activated.status).toBe(0);
  expect(activated.stdout).toBe(`activated ${base}..${tip}\n`);
  expect(git(held.repo, ["rev-parse", "HEAD"]).trim()).toBe(tip);
  expect(readFileSync(deployed, "utf8").trim().split("\n")).toEqual([tip, base, tip]);
});

test("success activates the current main descendant for an older stored tip", () => {
  const held = fixture();
  const deployed = join(held.root, "deployed");
  publishDeploy(held, deployed);
  const { base, tip, tree } = landingAttempt(held, "0139");
  const local = join(held.repo, "LOCAL");
  writeFileSync(local, "hold activation until later main work lands\n");

  const pending = runSuccess(held, {
    ATTEMPT_DIR: tree,
    SDLC_BRANCH: "ticket/0139",
    SDLC_REPO: held.repo,
    TICKET_ID: "0139",
    TICKET_REF: "sdlc/tickets/0139-fixture.md",
    ...landingWitness(held, tip),
  });
  expect(pending.status).toBe(4);
  expect(pending.stdout).toBe(`activation-pending ${base}..${tip}\n`);

  rmSync(local);
  git(held.repo, ["merge", "--quiet", "--ff-only", "origin/main"]);
  writeFileSync(join(held.repo, "LATER"), "work landed after the stored activation tip\n");
  git(held.repo, ["add", "LATER"]);
  git(held.repo, ["commit", "--quiet", "-m", "candidate: land later main work"]);
  git(held.repo, ["push", "--quiet", "origin", "main"]);
  const descendant = git(held.repo, ["rev-parse", "HEAD"]).trim();

  const activated = runSuccess(held, {
    ACTIVATION_BASE: base,
    ACTIVATION_TIP: tip,
    SDLC_REPO: held.repo,
  });

  expect(activated.status).toBe(0);
  expect(activated.stdout).toBe(`activated ${base}..${tip}\n`);
  expect(git(held.repo, ["rev-parse", "HEAD"]).trim()).toBe(descendant);
  expect(readFileSync(deployed, "utf8").trim().split("\n")).toEqual([descendant, base, tip]);
});

test.each([
  ["base", (tip: string) => ({ ACTIVATION_BASE: tip })],
  ["tip", (tip: string) => ({ ACTIVATION_TIP: tip })],
])("success refuses a one-sided activation %s before settlement", (_identity, activation) => {
  const held = fixture();
  const deployed = join(held.root, "deployed");
  const fetched = join(held.root, "fetched");
  publishDeploy(held, deployed);
  const { base, tip, tree } = landingAttempt(held, "0137");
  const bin = join(held.root, "bin");
  const actualGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  writeFileSync(join(bin, "git"), `#!/bin/sh\nif [ "$1" = -C ] && [ "$3" = fetch ]; then touch ${JSON.stringify(fetched)}; fi\nexec ${JSON.stringify(actualGit)} "$@"\n`);
  chmodSync(join(bin, "git"), 0o755);

  const refused = runSuccess(held, {
    ATTEMPT_DIR: tree,
    SDLC_BRANCH: "ticket/0137",
    SDLC_REPO: held.repo,
    TICKET_ID: "0137",
    TICKET_REF: "sdlc/tickets/0137-fixture.md",
    ...activation(tip),
    PATH: `${bin}:${held.path}`,
  });

  expect(refused.status).not.toBe(0);
  expect(refused.stderr).toContain("ACTIVATION_BASE and ACTIVATION_TIP must be supplied together");
  expect(refused.stdout).not.toMatch(/^(?:landed|activated|activation-pending|nothing to land)\b/m);
  expect(existsSync(fetched)).toBe(false);
  expect(git(held.repo, ["rev-parse", "origin/main"]).trim()).toBe(base);
  expect(git(held.repo, ["rev-parse", "HEAD"]).trim()).toBe(base);
  expect(existsSync(deployed)).toBe(false);
  expect(existsSync(tree)).toBe(true);
  expect(git(tree, ["rev-parse", "HEAD"]).trim()).toBe(tip);
  expect(git(held.repo, ["rev-parse", "ticket/0137"]).trim()).toBe(tip);
});

test("before reclaims this repository's unregistered Git worktree", () => {
  const held = fixture();
  const id = "0134";
  const tree = unregisteredOwnedTree(held, id);
  const marker = join(tree, "ORPHAN_MARKER");

  const retried = runBefore(held, id);

  expect(retried.status).toBe(0);
  expect(existsSync(marker)).toBe(false);
  expect(git(held.repo, ["worktree", "list", "--porcelain"])).toContain(`worktree ${tree}`);
});

test.each(["ordinary", "malformed pointer", "symlink", "foreign worktree"])("before refuses and preserves a %s", (shape) => {
  const held = fixture();
  const id = "0135";
  const tree = emptyTree(held, id);
  let marker: string;

  if (shape === "ordinary") {
    mkdirSync(tree, { recursive: true });
    marker = join(tree, "MARKER");
  } else if (shape === "malformed pointer") {
    mkdirSync(tree, { recursive: true });
    writeFileSync(join(tree, ".git"), "gitdir: not-a-worktree\nextra\n");
    marker = join(tree, "MARKER");
  } else if (shape === "symlink") {
    const target = join(held.root, "symlink-target");
    mkdirSync(target);
    marker = join(target, "MARKER");
    writeFileSync(marker, "a link is never an owned worktree\n");
    symlinkSync(target, tree);
  } else {
    const foreign = join(held.root, "foreign");
    git(held.root, ["clone", "--quiet", held.origin, foreign]);
    git(foreign, ["config", "user.email", "foreign@example.test"]);
    git(foreign, ["config", "user.name", "Foreign repository"]);
    git(foreign, ["worktree", "add", "--quiet", "-b", `foreign/${id}`, tree, "origin/main"]);
    marker = join(tree, "MARKER");
  }
  if (shape !== "symlink") writeFileSync(marker, "this path is not owned by the fixture repository\n");

  const result = runBefore(held, id);

  expect(result.status).not.toBe(0);
  expect(existsSync(marker)).toBe(true);
  if (shape === "symlink") expect(lstatSync(tree).isSymbolicLink()).toBe(true);
});
