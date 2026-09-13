import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { readAssembly } from "../src/assembly.ts";

test("a sequence filename must retain a name after its numeric prefix", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-flow-number-name-"));
  try {
    await mkdir(join(root, "flows/main"), { recursive: true });
    await Promise.all([
      writeFile(join(root, "ASSEMBLY.md"), "---\n{}\n---\nAssembly.\n"),
      writeFile(join(root, "flows/main/FLOW.md"), "---\ndescription: main\n---\n"),
      writeFile(join(root, "flows/main/1-.md"), "---\n{}\n---\nWork.\n"),
    ]);
    const parsed = readAssembly(root, {});
    expect(parsed.faults).toContainEqual(expect.objectContaining({ code: "number-missing", path: "flows/main/1-.md" }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
