// Ticket 0017 — a stage can select one caller-prepared directory. These
// witnesses use the real CLI and default gating: process cwd, local context,
// hooks, gates, and preflight all meet at that seam.
import { semanticCheck } from "./semantic-check.ts";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { chmod, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { queue, realBoundary, router, tempRoots } from "./cli-boundary.ts";

const roots = tempRoots();
const ROLES = ["investigator", "curator", "assessor", "adjudicator"] as const;

afterEach(async () => roots.cleanup());

function observer(kind: string): string {
  return `#!/bin/sh
printf 'cwd=[%s]\nrole=[%s]\n' "$(pwd -P)" "$(cat role.txt)" > ${kind}.txt
`;
}

async function roleFlow(home: string, trial: string): Promise<void> {
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nRun the four roles.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: four role review\nlocal-context: use\n---\n"),
  ]);

  for (const [index, role] of ROLES.entries()) {
    const stage = join(flow, `${String(index + 1).padStart(2, "0")}-${role}`);
    const workdir = join(trial, role);
    await Promise.all([
      mkdir(stage, { recursive: true }),
      mkdir(join(workdir, "skills/role-local"), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(stage, "STAGE.md"), `---\nworkdir: ./${role}\n---\nAct as ROLE ${role}.\n`),
      writeFile(join(stage, "before"), observer("before")),
      writeFile(join(stage, "gate"), observer("gate")),
      writeFile(join(stage, "success"), observer("success")),
      writeFile(join(stage, "failure"), observer("failure")),
      writeFile(join(workdir, "role.txt"), role),
      writeFile(join(workdir, "AGENTS.md"), `Workspace rules for ${role}.\n`),
      writeFile(join(workdir, "skills/role-local/SKILL.md"), `---\ndescription: local skill for ${role}\n---\nSkill body for ${role}.\n`),
    ]);
    await Promise.all(["before", "gate", "success", "failure"].map((name) => chmod(join(stage, name), 0o755)));
  }
}

test("check renders an explicit workdir, and the agent, local context, hooks, and gate use it", async () => {
  const { root, home } = await roots.scratch("bot-stage-workdir-");
  const trial = join(root, "NCT123");
  await roleFlow(home, trial);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);

  await expect(semanticCheck([ "review/main", "--in", trial, "--json"], held)).resolves.toBe(0);
  const checked = Buffer.concat(stdout).toString().trimEnd().split("\n").map((line) => JSON.parse(line) as { workdir?: string });
  expect(checked.map((line) => line.workdir)).toEqual(ROLES.map((role) => `./${role}`));
  stdout.splice(0);

  const systems: string[] = [];
  const inspect = (context: { systemPrompt?: string }) => {
    systems.push(context.systemPrompt ?? "");
    return fauxAssistantMessage([fauxToolCall("bash", {
      command: "printf 'cwd=[%s]\\nrole=[%s]\\n' \"$(pwd -P)\" \"$(cat role.txt)\" > model.txt; cat \"$SKILLS/role-local/SKILL.md\" >> model.txt",
    })], { stopReason: "toolUse" });
  };
  faux.setResponses(ROLES.flatMap(() => [
    inspect,
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "sealed" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
  ]));

  await expect(main(["run", "start", "review/main", "--in", trial, "the request"], held)).resolves.toBe(0);
  for (const [index, role] of ROLES.entries()) {
    const workdir = join(trial, role);
    const cwd = `cwd=[${await realpath(workdir)}]\nrole=[${role}]\n`;
    await expect(Promise.all([
      readFile(join(workdir, "before.txt"), "utf8"),
      readFile(join(workdir, "gate.txt"), "utf8"),
      readFile(join(workdir, "success.txt"), "utf8"),
    ])).resolves.toEqual([cwd, cwd, cwd]);
    await expect(readFile(join(workdir, "model.txt"), "utf8")).resolves.toBe(
      `${cwd}---\ndescription: local skill for ${role}\n---\nSkill body for ${role}.\n`,
    );
    expect(systems[index]).toContain(`Workspace rules for ${role}.`);
    expect(systems[index]).toContain(`local skill for ${role}`);
  }
});

test("stage starts retain authored and root-relative workdirs, and show renders both", async () => {
  const { root, home } = await roots.scratch("bot-record-stage-workdir-");
  const trial = join(root, "NCT123");
  await roleFlow(home, trial);
  const inherited = join(home, "assemblies/review/flows/main/04-adjudicator");
  await Promise.all([
    writeFile(join(inherited, "STAGE.md"), "---\n---\nWork from the inherited root.\n"),
    ...["before", "gate", "success", "failure"].map((name) => rm(join(inherited, name))),
  ]);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses(ROLES.flatMap(() => [
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "sealed" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
  ]));

  await expect(main(["run", "start", "review/main", "--in", trial, "the request"], held)).resolves.toBe(0);
  const run = (await readdir(join(home, "runs"))).find((name) => !name.endsWith(".lock")) ?? "";
  const starts = (await readFile(join(home, "runs", run, "record.jsonl"), "utf8")).trimEnd().split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>).filter((event) => event["event"] === "stage_start");
  const started = (stage: string): Record<string, unknown> =>
    starts.find((event) => event["stage"] === stage) ?? {};
  expect(started("01-investigator")["workdir"]).toEqual({ authored: "./investigator", resolved: "investigator" });
  expect(started("04-adjudicator")["workdir"]).toEqual({ authored: null, resolved: "." });

  stdout.splice(0);
  await expect(main(["run", "events", run], held)).resolves.toBe(0);
  const shown = Buffer.concat(stdout).toString();
  expect(shown).toContain("workdir ./investigator (investigator)");
  expect(shown).toMatch(/stage_start.*04-adjudicator.*inherited root/u);
});

test("a failure hook uses the same explicit cwd as the stage it closes", async () => {
  const { root, home } = await roots.scratch("bot-stage-workdir-failure-");
  const trial = join(root, "NCT123");
  await roleFlow(home, trial);
  const stage = join(home, "assemblies/review/flows/main/01-investigator");
  await Promise.all([
    writeFile(join(stage, "STAGE.md"), "---\nworkdir: ./investigator\nretries: 0\n---\nAct as investigator.\n"),
    writeFile(join(stage, "gate"), `${observer("gate")}exit 1\n`),
  ]);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "candidate" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
  ]);

  await expect(main(["run", "start", "review/main", "--in", trial, "the request"], held)).resolves.toBe(1);
  const workdir = join(trial, "investigator");
  await expect(readFile(join(workdir, "failure.txt"), "utf8")).resolves.toBe(
    `cwd=[${await realpath(workdir)}]\nrole=[investigator]\n`,
  );
});

test("a non-directory workdir makes check and run refuse before provider work without changing the workspace", async () => {
  const { root, home } = await roots.scratch("bot-stage-workdir-missing-");
  const trial = join(root, "NCT123");
  await roleFlow(home, trial);
  await rm(join(trial, "assessor"), { recursive: true });
  await writeFile(join(trial, "assessor"), "not a directory");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  let providerCalls = 0;
  faux.setResponses([() => {
    providerCalls += 1;
    return fauxAssistantMessage("provider was called");
  }]);

  await expect(semanticCheck([ "review/main", "--in", trial], held)).resolves.toBe(2);
  expect(Buffer.concat(stderr).toString()).toBe(
    "path-missing  ./assessor\n  Create the stage working directory.\n",
  );
  stderr.splice(0);
  await expect(main(["run", "start", "review/main", "--in", trial, "the request"], held)).resolves.toBe(2);
  expect(providerCalls).toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe(
    "path-missing  ./assessor\n  Create the stage working directory.\n",
  );
  await expect(readFile(join(trial, "assessor"), "utf8")).resolves.toBe("not a directory");
});

test.each([".", "roles/../investigator", "/outside"])("stage workdir %s is lexically refused", async (authored) => {
  const { root, home } = await roots.scratch("bot-stage-workdir-invalid-");
  const trial = join(root, "NCT123");
  await roleFlow(home, trial);
  await writeFile(
    join(home, "assemblies/review/flows/main/01-investigator/STAGE.md"),
    `---\nworkdir: ${authored}\n---\nAct as investigator.\n`,
  );
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = realBoundary(root, home, stdout, stderr);

  await expect(semanticCheck([ "review/main", "--in", trial], held)).resolves.toBe(2);
  expect(Buffer.concat(stderr).toString()).toContain("value-invalid  flows/main/01-investigator/STAGE.md");
});

// Ticket 0018 — containers do not mint a workdir. Each stage resolves its own
// declaration from --in, including concurrent branches and every loop repeat.
test("container stages render and keep their authored workdirs", async () => {
  const { root, home } = await roots.scratch("bot-container-workdir-");
  const trial = join(root, "NCT123");
  const base = join(home, "assemblies/review");
  const flow = join(base, "flows/main");
  const oracle = join(base, "subflows/oracle");
  const stage = async (path: string, marker: string, workdir: string, hook: string): Promise<void> => {
    await mkdir(path, { recursive: true });
    await Promise.all([
      writeFile(join(path, "STAGE.md"), `---\nworkdir: ./${workdir}\n---\n${marker}\n`),
      writeFile(join(path, "success"), `#!/bin/sh\npwd -P > ${hook}\n`),
    ]);
    await chmod(join(path, "success"), 0o755);
  };
  await Promise.all([
    mkdir(flow, { recursive: true }),
    ...["alpha", "beta", "shared", "loop"].map((name) => mkdir(join(trial, name), { recursive: true })),
  ]);
  await Promise.all([
    mkdir(join(flow, "01-distinct"), { recursive: true }),
    mkdir(join(flow, "02-shared"), { recursive: true }),
    mkdir(join(flow, "03-repeat"), { recursive: true }),
    mkdir(join(flow, "04-tail"), { recursive: true }),
    mkdir(join(oracle, "01-answer"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(base, "ASSEMBLY.md"), "---\nintelligence: default\n---\nWork in containers.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: container workdirs\n---\n"),
    writeFile(join(flow, "01-distinct/PARALLEL.md"), "---\nwidth: 2\n---\n"),
    writeFile(join(flow, "02-shared/PARALLEL.md"), "---\nwidth: 2\n---\n"),
    writeFile(join(flow, "03-repeat/LOOP.md"), "---\nrepeat: 2\n---\n"),
    writeFile(join(flow, "04-tail/STAGE.md"), "---\n---\nFinish the container work.\n"),
    writeFile(join(oracle, "FLOW.md"), "---\ndescription: child work\n---\n"),
    writeFile(join(oracle, "01-answer/STAGE.md"), "---\n---\nChild work.\n"),
    writeFile(join(oracle, "01-answer/success"), "#!/bin/sh\npwd -P > child-workdir.txt\n"),
  ]);
  await chmod(join(oracle, "01-answer/success"), 0o755);
  await Promise.all([
    stage(join(flow, "01-distinct/alpha"), "Distinct alpha.", "alpha", "alpha-workdir.txt"),
    stage(join(flow, "01-distinct/beta"), "Distinct beta.", "beta", "beta-workdir.txt"),
    stage(join(flow, "02-shared/alpha"), "Shared alpha.", "shared", "shared-alpha-workdir.txt"),
    stage(join(flow, "02-shared/beta"), "Shared beta.", "shared", "shared-beta-workdir.txt"),
    stage(join(flow, "03-repeat/01-work"), "Repeat work.", "loop", "loop-workdir.txt"),
  ]);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);

  await expect(semanticCheck([ "review/main", "--in", trial, "--json"], held)).resolves.toBe(0);
  const checked = Buffer.concat(stdout).toString().trimEnd().split("\n")
    .map((line) => JSON.parse(line) as { stage: string; type: string; workdir?: string })
    .filter((line) => line.type === "STAGE");
  expect(Object.fromEntries(checked.map((line) => [line.stage, line.workdir]))).toEqual({
    "01-distinct/alpha": "./alpha", "01-distinct/beta": "./beta",
    "02-shared/alpha": "./shared", "02-shared/beta": "./shared",
    "03-repeat/01-work": "./loop", "04-tail": undefined,
  });
  stdout.splice(0);

  const write = (): ReturnType<typeof fauxAssistantMessage> =>
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "sealed" })], { stopReason: "toolUse" });
  const normal = (round: number): ReturnType<typeof fauxAssistantMessage> => round % 2 === 1 ? write() : fauxAssistantMessage("done");
  queue(faux, router({
    "Distinct alpha.": normal, "Distinct beta.": normal,
    "Shared alpha.": normal, "Shared beta.": normal,
    "Finish the container work.": normal,
    "Repeat work.": (round) => round % 4 === 1
      ? fauxAssistantMessage([fauxToolCall("subflow", { calls: [{ flow: "oracle", input: "check the workdir" }] })], { stopReason: "toolUse" })
      : round % 4 === 2
        ? fauxAssistantMessage([fauxToolCall("bash", { command: "test -f first-repeat.txt && printf 'visible\\n' > later-repeat.txt || : > first-repeat.txt" })], { stopReason: "toolUse" })
        : round % 4 === 3 ? write() : fauxAssistantMessage("done"),
    "Child work.": normal,
  }), 30);
  await expect(main(["run", "start", "review/main", "--in", trial, "the request"], held)).resolves.toBe(0);
  await expect(Promise.all([
    readFile(join(trial, "alpha/alpha-workdir.txt"), "utf8"),
    readFile(join(trial, "beta/beta-workdir.txt"), "utf8"),
    readFile(join(trial, "shared/shared-alpha-workdir.txt"), "utf8"),
    readFile(join(trial, "shared/shared-beta-workdir.txt"), "utf8"),
    readFile(join(trial, "loop/loop-workdir.txt"), "utf8"),
    readFile(join(trial, "loop/child-workdir.txt"), "utf8"),
  ])).resolves.toEqual([
    `${await realpath(join(trial, "alpha"))}\n`, `${await realpath(join(trial, "beta"))}\n`,
    `${await realpath(join(trial, "shared"))}\n`, `${await realpath(join(trial, "shared"))}\n`, `${await realpath(join(trial, "loop"))}\n`, `${await realpath(join(trial, "loop"))}\n`,
  ]);
  await expect(readFile(join(trial, "loop/later-repeat.txt"), "utf8")).resolves.toBe("visible\n");
});
