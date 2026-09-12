import { execFileSync, spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";

const roots: string[] = [];
const scriptSource = await readFile(new URL("../../sdlc/scripts/spec", import.meta.url), "utf8");
const makefileSource = await readFile(new URL("../../Makefile", import.meta.url), "utf8");
const typescriptSource = fileURLToPath(new URL("../node_modules/typescript", import.meta.url));

const constructors = `
export function alphaEvent(input: { ts: string; required: string; optional?: string }) {
  return {
    ts: input.ts,
    event: "alpha" as const,
    required: input.required,
    ...(input.optional === undefined ? {} : { optional: input.optional }),
  };
}

export type RecordEvent = ReturnType<typeof alphaEvent>;
`;

const recordSpecification = `
# The record

| Event | Top-level fields |
| --- | --- |
| alpha | \`ts\`, \`event\`, \`required\`, \`optional\` |
`;

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bot-spec-vocabulary-"));
  roots.push(root);
  await Promise.all([
    mkdir(join(root, "bot/src"), { recursive: true }),
    mkdir(join(root, "bot/node_modules"), { recursive: true }),
    mkdir(join(root, "sdlc/scripts"), { recursive: true }),
    mkdir(join(root, "specification/elements"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(root, "bot/src/record-events.ts"), constructors),
    symlink(typescriptSource, join(root, "bot/node_modules/typescript"), "dir"),
    writeFile(join(root, "sdlc/scripts/spec"), scriptSource),
    writeFile(join(root, "specification/elements/record.md"), recordSpecification),
    writeFile(join(root, "specification/CHANGELOG.md"), "# Changelog\n"),
  ]);
  await chmod(join(root, "sdlc/scripts/spec"), 0o755);

  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "spec-test@example.invalid");
  git("config", "user.name", "Spec Test");
  git("add", ".");
  git("commit", "-qm", "fixture");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  git("checkout", "-qb", "ticket");
  return root;
}

function runSpec(root: string) {
  return spawnSync(join(root, "sdlc/scripts/spec"), [], { cwd: root, encoding: "utf8" });
}

async function makeFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bot-spec-gate-"));
  roots.push(root);
  await Promise.all([
    mkdir(join(root, "bot/src"), { recursive: true }),
    mkdir(join(root, "bot/node_modules"), { recursive: true }),
    mkdir(join(root, "sdlc/scripts"), { recursive: true }),
    mkdir(join(root, "specification/elements"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(root, "Makefile"), makefileSource),
    writeFile(join(root, "bot/src/record-events.ts"), constructors),
    symlink(typescriptSource, join(root, "bot/node_modules/typescript"), "dir"),
    writeFile(join(root, "sdlc/scripts/spec"), scriptSource),
    writeFile(join(root, "sdlc/scripts/lint"), "#!/bin/sh\nexit 0\n"),
    writeFile(join(root, "sdlc/scripts/test"), "#!/bin/sh\nexit 0\n"),
    writeFile(join(root, "specification/elements/home.md"), "# Home\n"),
    writeFile(join(root, "specification/elements/record.md"), recordSpecification),
    writeFile(join(root, "specification/CHANGELOG.md"), "# Changelog\n"),
  ]);
  await Promise.all([
    chmod(join(root, "sdlc/scripts/spec"), 0o755),
    chmod(join(root, "sdlc/scripts/lint"), 0o755),
    chmod(join(root, "sdlc/scripts/test"), 0o755),
  ]);

  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "spec-test@example.invalid");
  git("config", "user.name", "Spec Test");
  git("add", ".");
  git("commit", "-qm", "fixture");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  git("checkout", "-qb", "ticket");
  return root;
}

function runCheck(root: string) {
  const target = "check";
  return spawnSync("make", [target], {
    cwd: root,
    env: { ...process.env, SDLC_IN_CHECK: undefined },
    encoding: "utf8",
  });
}

test("the root check invokes the specification gate once", async () => {
  const root = await makeFixture();
  const result = spawnSync("make", ["-n", "check"], { cwd: root, encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout.split("\n").filter((line) => line.includes("sh sdlc/scripts/spec"))).toHaveLength(1);
});

test("the root check rejects a missing specification link", async () => {
  const root = await makeFixture();
  await Promise.all([
    writeFile(join(root, "specification/elements/home.md"), "# Home\n\nSee [auth](missing.md).\n"),
    writeFile(join(root, "specification/CHANGELOG.md"), "# Changelog\n\nCorrected the home link.\n"),
  ]);
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", "break link"], { cwd: root });

  const result = runCheck(root);

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(
    "spec link: specification/elements/home.md targets missing repository path missing.md",
  );
});

test("the root check rejects a documented record field absent from RecordEvent", async () => {
  const root = await makeFixture();
  await Promise.all([
    writeFile(
      join(root, "specification/elements/record.md"),
      recordSpecification.replace("`optional` |", "`optional`, `documented_only` |"),
    ),
    writeFile(join(root, "specification/CHANGELOG.md"), "# Changelog\n\nDocumented a record field.\n"),
  ]);
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", "break vocabulary"], { cwd: root });

  const result = runCheck(root);

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("record vocabulary: event alpha field documented_only is stale in the specification");
});

test("the spec gate rejects a constructor field added without documentation", async () => {
  const root = await fixture();
  await writeFile(
    join(root, "bot/src/record-events.ts"),
    constructors.replace("required: input.required,", "required: input.required,\n    new_field: input.required,"),
  );
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", "extend record"], { cwd: root });

  const result = runSpec(root);

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("alpha");
  expect(result.stderr).toContain("new_field");
}, 15_000);

test("the spec gate rejects a documented constructor field removed from the spec", async () => {
  const root = await fixture();
  await Promise.all([
    writeFile(
      join(root, "specification/elements/record.md"),
      recordSpecification.replace(", `optional`", ""),
    ),
    writeFile(join(root, "specification/CHANGELOG.md"), "# Changelog\n\nUpdated the record wording.\n"),
  ]);
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", "edit specification"], { cwd: root });

  const result = runSpec(root);

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("alpha");
  expect(result.stderr).toContain("optional");
}, 15_000);

test("the spec gate rejects a relative link to a missing file", async () => {
  const root = await fixture();
  await Promise.all([
    writeFile(
      join(root, "specification/elements/record.md"),
      `${recordSpecification}\nSee [the absent chapter](absent.md).\n`,
    ),
    writeFile(join(root, "specification/CHANGELOG.md"), "# Changelog\n\nLinked another chapter.\n"),
  ]);
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", "link chapter"], { cwd: root });

  const result = runSpec(root);

  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("specification/elements/record.md");
  expect(result.stderr).toContain("absent.md");
}, 15_000);
