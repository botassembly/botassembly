import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { readAssembly } from "../src/assembly.ts";

type SubflowScope = "none" | "root" | "flow" | "stage";

async function writeSubflow(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(join(directory, "FLOW.md"), "---\ndescription: helper\n---\n"),
    writeFile(join(directory, "01-help.md"), "---\n---\nHelp.\n"),
  ]);
}

async function fixture(access: string, scope: SubflowScope = "none", control = false): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bot-stage-access-authoring-"));
  const flow = join(root, "flows/main");
  const stage = join(flow, control ? "01-loop" : "01-work");
  await mkdir(stage, { recursive: true });
  await Promise.all([
    writeFile(join(root, "ASSEMBLY.md"), "---\nslots:\n  data: project data\n---\nReview.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main\n---\n"),
    control
      ? writeFile(join(stage, "LOOP.md"), `---\nrepeat: 1\n${access}---\n`)
      : writeFile(join(stage, "STAGE.md"), `---\n${access}---\nWork.\n`),
    ...(control ? [writeFile(join(stage, "01-inner.md"), "---\n---\nWork.\n")] : []),
  ]);
  const subflow = scope === "root"
    ? join(root, "subflows/helper")
    : scope === "flow"
      ? join(flow, "subflows/helper")
      : join(stage, "subflows/helper");
  if (scope !== "none") await writeSubflow(subflow);
  return root;
}

test("stage access accepts exactly its closed authored grammar", async () => {
  const cases: {
    name: string;
    access: string;
    scope?: SubflowScope;
    control?: boolean;
    fault?: string;
  }[] = [
    { name: "complete declaration", scope: "root", access: "access:\n  read: [INPUT, DATA, SUBFLOWS]\n  write: [OUTPUT, TMP]\n  edit: [PWD, SKILLS]\n  bash: [a, '9', a.b_c+d-e0]\n" },
    { name: "empty mapping denies every operation", access: "access: {}\n" },
    { name: "empty arrays deny each named operation", access: "access:\n  read: []\n  write: []\n  edit: []\n  bash: []\n" },
    { name: "scalar mapping", access: "access: nope\n", fault: "Give access a mapping" },
    { name: "null mapping", access: "access: null\n", fault: "Give access a mapping" },
    { name: "array mapping", access: "access: [read]\n", fault: "Give access a mapping" },
    { name: "unknown operation", access: "access:\n  execute: [git]\n", fault: "unknown access operation execute" },
    { name: "non-array operation", access: "access:\n  read: INPUT\n", fault: "Give access.read an array" },
    { name: "duplicate name", access: "access:\n  read: [INPUT, INPUT]\n", fault: "duplicate INPUT" },
    { name: "non-string member", access: "access:\n  read: [INPUT, 7]\n", fault: "valid managed names" },
    { name: "invalid managed-slot name", access: "access:\n  read: [input]\n", fault: "valid managed names" },
    { name: "unavailable managed slot", access: "access:\n  read: [MISSING]\n", fault: "available managed slot" },
    { name: "bash name begins with punctuation", access: "access:\n  bash: [_git]\n", fault: "valid managed names" },
    { name: "bash name contains a slash", access: "access:\n  bash: [bin/git]\n", fault: "valid managed names" },
    { name: "bash name contains a space", access: "access:\n  bash: ['git status']\n", fault: "valid managed names" },
    { name: "bash name contains non-ASCII", access: "access:\n  bash: [gít]\n", fault: "valid managed names" },
    { name: "SUBFLOWS without an available subflow", access: "access:\n  read: [SUBFLOWS]\n", fault: "available managed slot" },
    { name: "SUBFLOWS from a root subflow", scope: "root", access: "access:\n  read: [SUBFLOWS]\n" },
    { name: "SUBFLOWS from a flow subflow", scope: "flow", access: "access:\n  read: [SUBFLOWS]\n" },
    { name: "SUBFLOWS from a stage subflow", scope: "stage", access: "access:\n  read: [SUBFLOWS]\n" },
    { name: "access on a control sentinel", control: true, access: "access: {}\n", fault: "unknown key access" },
  ];

  for (const held of cases) {
    const root = await fixture(held.access, held.scope, held.control);
    try {
      const faults = readAssembly(root, {}).faults;
      if (held.fault === undefined) expect(faults, held.name).toEqual([]);
      else expect(faults.map(({ sentence }) => sentence).join("\n"), held.name).toContain(held.fault);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});
