import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { readAssembly } from "../src/assembly.ts";
import { main } from "../src/cli.ts";
import { realBoundary } from "./cli-boundary.ts";

async function fixture(folder: boolean, declaration: string): Promise<{ root: string; assembly: string }> {
  const root = await mkdtemp(join(tmpdir(), "bot-retired-access-"));
  const assembly = join(root, "assembly");
  const flow = join(assembly, "flows/main");
  await mkdir(folder ? join(flow, "01-work") : flow, { recursive: true });
  await Promise.all([
    writeFile(join(assembly, "ASSEMBLY.md"), "---\n---\nReview.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(folder ? join(flow, "01-work/STAGE.md") : join(flow, "01-work.md"), `---\n${declaration}---\nWork.\n`),
  ]);
  return { root, assembly };
}

test.each([
  ["single-file", false, "access:\n  read: [INPUT]\n"],
  ["folder", true, "access: {}\n"],
] as const)("a %s stage refuses retired access as an unknown key before model work", async (_name, folder, declaration) => {
  const held = await fixture(folder, declaration);
  try {
    expect(readAssembly(held.assembly, {}).faults).toEqual([
      expect.objectContaining({ code: "key-unknown", sentence: "Remove the unknown key access." }),
    ]);
    const home = join(held.root, "home"), out: Buffer[] = [], err: Buffer[] = [];
    const supplied = realBoundary(held.root, home, out, err).held;
    const { models: _models, ...boundary } = supplied;
    let contacted = false;
    const code = await main(["run", "start", `${held.assembly}/main`, "request"], {
      ...boundary,
      modelRuntime: () => { contacted = true; throw new Error("model must not load"); },
    });
    expect(code).toBe(2);
    expect(contacted).toBe(false);
    expect(Buffer.concat(out)).toEqual(Buffer.alloc(0));
    expect(Buffer.concat(err).toString()).toContain("unknown key access");
  } finally {
    await rm(held.root, { recursive: true, force: true });
  }
});

test("the retired-access model tripwire is live for an otherwise valid stage", async () => {
  const held = await fixture(false, "");
  try {
    const home = join(held.root, "home"), out: Buffer[] = [], err: Buffer[] = [];
    await mkdir(home, { recursive: true });
    const supplied = realBoundary(held.root, home, out, err).held;
    const { models: _models, ...boundary } = supplied;
    let contacted = false;
    await main(["run", "start", `${held.assembly}/main`, "request"], {
      ...boundary,
      modelRuntime: () => { contacted = true; throw new Error("model tripwire reached"); },
    });
    expect(contacted).toBe(true);
  } finally {
    await rm(held.root, { recursive: true, force: true });
  }
});
