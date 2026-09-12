// Ticket 0146: consumer proofs for the canonical settlement scripts copied
// into Botassembly. These fixtures exercise the changed results, not Bot code.
import { chmodSync, cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";

const PROJECT = fileURLToPath(new URL("../../sdlc/project/", import.meta.url));
const TASKS = join(PROJECT, "tasks");
const roots: string[] = [];

interface Fixture {
  root: string;
  origin: string;
  repo: string;
  path: string;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), "botassembly-settlement-"));
  roots.push(root);
  const origin = join(root, "origin.git");
  const repo = join(root, "repo");
  git(root, ["init", "--bare", "--initial-branch=main", origin]);
  git(root, ["clone", "--quiet", origin, repo]);
  git(repo, ["config", "user.email", "settlement@example.test"]);
  git(repo, ["config", "user.name", "Settlement test"]);
  writeFileSync(join(repo, "README"), "settlement fixture\n");
  mkdirSync(join(repo, "sdlc", "project"), { recursive: true });
  cpSync(TASKS, join(repo, "sdlc", "project", "tasks"));
  git(repo, ["add", "README", "sdlc/project/tasks"]);
  git(repo, ["commit", "--quiet", "-m", "fixture: establish main"]);
  git(repo, ["push", "--quiet", "-u", "origin", "main"]);
  return { root, origin, repo, path: process.env.PATH ?? "" };
}

function candidate(held: Fixture, id: string): { base: string; tip: string; tree: string } {
  const base = git(held.repo, ["rev-parse", "HEAD"]).trim();
  const tree = join(held.root, `attempt-${id}`);
  git(held.repo, ["worktree", "add", "--quiet", "-b", `ticket/${id}`, tree, "origin/main"]);
  writeFileSync(join(tree, "CANDIDATE"), "candidate evidence\n");
  git(tree, ["add", "CANDIDATE"]);
  git(tree, ["commit", "--quiet", "-m", "code: preserve candidate"]);
  return { base, tip: git(tree, ["rev-parse", "HEAD"]).trim(), tree };
}

function runFailure(held: Fixture, id: string, extra: Record<string, string>) {
  return spawnSync(join(PROJECT, "failure"), [], {
    cwd: held.repo,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: held.path,
      TICKET_ID: id,
      TICKET_REF: `sdlc/tickets/${id}-fixture.md`,
      TICKET_FLOW: "build",
      ...extra,
    },
  });
}

function runSuccess(held: Fixture, id: string, tree: string, extra: Record<string, string> = {}) {
  return spawnSync(join(PROJECT, "success"), [], {
    cwd: held.repo,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: held.path,
      TICKET_ID: id,
      TICKET_REF: `sdlc/tickets/${id}-fixture.md`,
      TICKET_FLOW: "build",
      ATTEMPT_DIR: tree,
      SDLC_BRANCH: `ticket/${id}`,
      SDLC_REPO: held.repo,
      ...extra,
    },
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
  writeFileSync(bot, `#!/bin/sh\n[ "$1" = run ] && [ "$2" = check ] && [ "$3" = ${JSON.stringify(runId)} ] && [ "$4" = gate ] && [ "$5" = --file ] && [ "$6" = flows/build/05-verify/gate/06-witness ] && [ "$7" = --raw ] && [ "$8" = --home ] && [ "$9" = ${JSON.stringify(botHome)} ] || exit 2\ncat ${JSON.stringify(join(run, capture))}\n`);
  chmodSync(bot, 0o755);
  return { BOT_CMD: bot, BOT_HOME: botHome, RUN_ID: runId };
}

function commandPath(held: Fixture, name: string, body: string): string {
  const bin = join(held.root, `${name}-bin`);
  mkdirSync(bin);
  const command = join(bin, name);
  writeFileSync(command, `#!/bin/sh\n${body}\n`);
  chmodSync(command, 0o755);
  return `${bin}:${held.path}`;
}

function blockedRemovalPath(held: Fixture, tree: string): string {
  const bin = join(held.root, "blocked-removal-bin");
  mkdirSync(bin);
  const actualGit = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  const actualRm = execFileSync("sh", ["-c", "command -v rm"], { encoding: "utf8" }).trim();
  writeFileSync(join(bin, "git"), `#!/bin/sh
if [ "$1" = -C ] && [ "$3" = worktree ] && [ "$4" = remove ]; then exit 1; fi
exec ${JSON.stringify(actualGit)} "$@"
`);
  writeFileSync(join(bin, "rm"), `#!/bin/sh
if [ "$1" = -rf ] && [ "$2" = ${JSON.stringify(tree)} ]; then exit 1; fi
exec ${JSON.stringify(actualRm)} "$@"
`);
  chmodSync(join(bin, "git"), 0o755);
  chmodSync(join(bin, "rm"), 0o755);
  return `${bin}:${held.path}`;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("withdrawal resolves the bot liveness command through PATH", () => {
  const held = fixture();
  const { tree } = candidate(held, "0146");
  const liveness = join(held.root, "liveness-call");
  const path = commandPath(held, "bot", `printf '%s\\n' "$*" > ${JSON.stringify(liveness)}\n[ "$1" = home ] && [ "$2" = busy ] && [ "$3" = ${JSON.stringify(tree)} ] && [ "$4" = --quiet ] && exit 0\nexit 2`);

  const settled = runFailure(held, "0146", { BOT_CMD: "bot", SETTLEMENT: "withdrawn", PATH: path });

  expect(settled.status).toBe(2);
  expect(existsSync(liveness)).toBe(true);
  expect(readFileSync(liveness, "utf8")).toBe(`home busy ${tree} --quiet\n`);
  expect(existsSync(tree)).toBe(true);
});

test("withdrawal accepts the exact quiet idle answer", () => {
  const held = fixture();
  const { tree } = candidate(held, "0146");
  const liveness = join(held.root, "liveness-call");
  const path = commandPath(held, "bot", `printf '%s\\n' "$*" > ${JSON.stringify(liveness)}\n[ "$1" = home ] && [ "$2" = busy ] && [ "$3" = ${JSON.stringify(tree)} ] && [ "$4" = --quiet ] && exit 1\nexit 2`);

  const settled = runFailure(held, "0146", { BOT_CMD: "bot", SETTLEMENT: "withdrawn", PATH: path });

  expect(settled.status).toBe(0);
  expect(readFileSync(liveness, "utf8")).toBe(`home busy ${tree} --quiet\n`);
  expect(existsSync(tree)).toBe(false);
});

test("a ready fault retains its candidate for the retry", () => {
  const held = fixture();
  const { tip, tree } = candidate(held, "0146");

  const settled = runFailure(held, "0146", {
    ATTEMPT_DIR: tree,
    RUN_CAUSE: "fault",
    SDLC_BRANCH: "ticket/0146",
    SDLC_REPO: held.repo,
    SETTLEMENT: "ready",
  });

  expect(settled.status).toBe(0);
  expect(existsSync(tree)).toBe(true);
  expect(git(tree, ["rev-parse", "HEAD"]).trim()).toBe(tip);
  expect(git(held.repo, ["rev-parse", "ticket/0146"]).trim()).toBe(tip);
});

test("an absent attempt path cannot strand a registered worktree without its branch", () => {
  const held = fixture();
  const { tree } = candidate(held, "0198");

  const settled = runFailure(held, "0198", {
    ATTEMPT_DIR: "",
    RUN_CAUSE: "rejected",
    SDLC_BRANCH: "ticket/0198",
    SDLC_REPO: held.repo,
    SETTLEMENT: "ready",
  });

  const registered = git(held.repo, ["worktree", "list", "--porcelain"]).includes(`worktree ${tree}\n`);
  const branchExists = git(held.repo, ["branch", "--list", "ticket/0198"]).trim() !== "";
  expect(branchExists).toBe(registered);
  if (registered) expect(settled.status).toBe(2);
});

test("pending activation remains pending when teardown fails", () => {
  const held = fixture();
  const { base, tip, tree } = candidate(held, "0146");
  writeFileSync(join(held.repo, "LOCAL"), "keep the checkout dirty\n");

  const settled = runSuccess(held, "0146", tree, {
    PATH: blockedRemovalPath(held, tree),
    ...landingWitness(held, tip),
  });

  expect(settled.status).toBe(4);
  expect(settled.stdout).toBe(`activation-pending ${base}..${tip}\n`);
  expect(settled.stderr).toContain(`settlement failed: worktree removal ${tree}`);
  expect(git(held.repo, ["rev-parse", "origin/main"]).trim()).toBe(tip);
  expect(existsSync(tree)).toBe(true);
});

test("an interrupted durable landing deploys the advanced main on retry", () => {
  const held = fixture();
  const deployments = join(held.root, "deployments");
  mkdirSync(join(held.repo, "sdlc", "scripts"), { recursive: true });
  const deploy = join(held.repo, "sdlc", "scripts", "deploy");
  writeFileSync(deploy, `#!/bin/sh\ngit rev-parse HEAD >> ${JSON.stringify(deployments)}\n`);
  chmodSync(deploy, 0o755);
  git(held.repo, ["add", "sdlc/scripts/deploy"]);
  git(held.repo, ["commit", "--quiet", "-m", "fixture: add deploy hook"]);
  git(held.repo, ["push", "--quiet", "origin", "main"]);
  const { tip: landedTip, tree } = candidate(held, "0146");
  git(tree, ["push", "--quiet", "origin", `${landedTip}:main`]);

  const publisher = join(held.root, "publisher");
  git(held.root, ["clone", "--quiet", held.origin, publisher]);
  git(publisher, ["config", "user.email", "publisher@example.test"]);
  git(publisher, ["config", "user.name", "Settlement publisher"]);
  writeFileSync(join(publisher, "LATER"), "main advanced before the retry\n");
  git(publisher, ["add", "LATER"]);
  git(publisher, ["commit", "--quiet", "-m", "fixture: advance main"]);
  const currentTip = git(publisher, ["rev-parse", "HEAD"]).trim();
  git(publisher, ["push", "--quiet", "origin", "main"]);

  const settled = runSuccess(held, "0146", tree);

  expect(settled.status).toBe(0);
  expect(existsSync(deployments)).toBe(true);
  expect(readFileSync(deployments, "utf8").trim()).toBe(currentTip);
  expect(git(held.repo, ["rev-parse", "HEAD"]).trim()).toBe(currentTip);
  expect(git(held.repo, ["merge-base", "--is-ancestor", landedTip, currentTip])).toBe("");
  expect(existsSync(tree)).toBe(false);
});
