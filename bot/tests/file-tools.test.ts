import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { SlotExecutionEnv, createControlContext, createFileTools, expandSlotPath } from "../src/tools.ts";

async function stageGround() {
  const ground = await mkdtemp(join(tmpdir(), "bot-file-tools-"));
  const slots = {
    INPUT: join(ground, "input"), OUTPUT: join(ground, "output.txt"),
    TMP: join(ground, "tmp"), SKILLS: join(ground, "skills"), SUBFLOWS: join(ground, "subflows"),
    DATA: join(ground, "data"), PWD: ground,
  };
  await Promise.all([slots.INPUT, slots.TMP, slots.SKILLS, slots.SUBFLOWS, slots.DATA]
    .map((path) => mkdir(path, { recursive: true })));
  // The stage environment, as machinery.ts composes it: the slots over what the
  // caller's environment carried. PATH is named because since ticket 0139 the
  // shell inherits NOTHING — the supplied environment is the whole of it.
  const stageEnv = { ...slots, PATH: process.env["PATH"] ?? "" };
  const context = createControlContext([], [], new SlotExecutionEnv({ cwd: ground, shellEnv: stageEnv }, slots));
  const tools = createFileTools(stageEnv);
  const tool = (name: string) => {
    const held = tools.find((candidate) => candidate.name === name);
    if (held === undefined) throw new Error(`No ${name} tool.`);
    return (params: object) => held.execute("call", params, undefined, undefined, context);
  };
  return { slots, tool, tools };
}

function flattened(result: { content: string | { type: string; text?: string }[] }): string {
  if (typeof result.content === "string") return result.content;
  return result.content.map((part) => part.text ?? "").join("\n");
}

test("expandSlotPath expands a leading slot variable and nothing else", () => {
  const slots = { INPUT: "/stage/input", OUTPUT: "/stage/output.txt" };
  expect(expandSlotPath("$INPUT/request.txt", slots)).toBe("/stage/input/request.txt");
  expect(expandSlotPath("$OUTPUT", slots)).toBe("/stage/output.txt");
  expect(expandSlotPath("$INPUTS/x", slots)).toBe("$INPUTS/x");
  expect(expandSlotPath("a/$INPUT/b", slots)).toBe("a/$INPUT/b");
  expect(expandSlotPath("$HOME/x", slots)).toBe("$HOME/x");
});

test("read receives $INPUT paths expanded to the stage's input directory", async () => {
  const { slots, tool } = await stageGround();
  await writeFile(join(slots.INPUT, "request.txt"), "the stage input\n");
  const result = await tool("read")({ path: "$INPUT/request.txt" });
  expect(flattened(result)).toContain("the stage input");
});

test("write receives a bare $OUTPUT path expanded to the output file", async () => {
  const { slots, tool } = await stageGround();
  await tool("write")({ path: "$OUTPUT", content: "finished\n" });
  await expect(readFile(slots.OUTPUT, "utf8")).resolves.toBe("finished\n");
});

test("edit expands $TMP paths and a declared slot expands like a runtime slot", async () => {
  const { slots, tool } = await stageGround();
  await writeFile(join(slots.TMP, "draft.txt"), "alpha beta\n");
  await tool("edit")({ path: "$TMP/draft.txt", edits: [{ oldText: "beta", newText: "gamma" }] });
  await expect(readFile(join(slots.TMP, "draft.txt"), "utf8")).resolves.toBe("alpha gamma\n");
  await tool("write")({ path: "$DATA/note.txt", content: "declared\n" });
  await expect(readFile(join(slots.DATA, "note.txt"), "utf8")).resolves.toBe("declared\n");
});

// Ticket 0061's tool-availability witness, qualified by Ticket 0184: the
// runtime provides this complete file-tool set before any stage access policy
// wraps model-facing dispatch. The walk found the shell unwitnessed:
// `createBashTool` could be deleted from createFileTools with all 337 tests and
// the whole corpus still green, and this is the test that stops that being
// true. Invariant 36's operating-system reach is exercised through the shell.
test("the runtime's file tools include read, write, edit, and a shell", async () => {
  const { slots, tool, tools } = await stageGround();
  expect(tools.map((held) => held.name)).toEqual(["read", "write", "edit", "bash"]);

  // Invariant 36's two named freedoms, exercised rather than asserted about:
  // the shell changes directory, and it reads the environment it was handed.
  const result = await tool("bash")({ command: 'cd "$DATA" && pwd && printenv TMP' });
  const text = flattened(result);
  expect(text).toContain(slots.DATA);
  expect(text).toContain(slots.TMP);
});

// Ticket 0066 — the expansion moved from the tool's parameters to the env's
// `absolutePath`, so it must still reach every slot and must still defer to
// NodeExecutionEnv for everything that is not one.
test("every slot name resolves, and relative and absolute paths resolve as before", async () => {
  const { slots, tool } = await stageGround();
  const wrote = async (path: string) => {
    await tool("write")({ path, content: "held\n" });
    return flattened(await tool("read")({ path }));
  };
  for (const slot of ["INPUT", "TMP", "SKILLS", "SUBFLOWS", "DATA", "PWD"] as const) {
    await expect(wrote(`$${slot}/note.txt`)).resolves.toContain("held");
    await expect(readFile(join(slots[slot], "note.txt"), "utf8")).resolves.toBe("held\n");
  }
  await expect(wrote("$OUTPUT")).resolves.toContain("held");
  // A relative path is still resolved against cwd, and an absolute path is
  // still taken as written: the wrapper expands, it does not intercept.
  await expect(wrote("relative/note.txt")).resolves.toContain("held");
  await expect(readFile(join(slots.PWD, "relative/note.txt"), "utf8")).resolves.toBe("held\n");
  await expect(wrote(join(slots.DATA, "absolute.txt"))).resolves.toContain("held");
});

test("a non-slot variable in a tool path stays literal", async () => {
  const { tool } = await stageGround();
  await expect(tool("read")({ path: "$HOME/anything.txt" })).rejects.toThrow(/\$HOME\/anything\.txt/u);
});

// Ticket 0139 leg 5. Pi resolves a leading `~` to the REAL home before a file
// tool touches the disk, so `~/.pi/auth.json` was a working address from inside
// a stage — the caller's own credential file, by shorthand. Every file tool
// addresses the disk through `absolutePath` (the note on SlotExecutionEnv), so
// refusing there refuses for all of them, which is what the loop below says.
// Nothing here writes or reads a real home: the refusal happens before any
// path is resolved, which is the whole point.
const TILDE_REFUSAL = "A path that starts with ~ is not allowed here; write the path out in full.";

test("every file tool refuses a path that starts with ~, in one sentence, before it is resolved against the real home", async () => {
  const { tool } = await stageGround();
  const calls: [string, object][] = [
    ["read", { path: "~/.pi/auth.json" }],
    ["write", { path: "~/.pi/auth.json", content: "never\n" }],
    ["edit", { path: "~/.pi/auth.json", edits: [{ oldText: "a", newText: "b" }] }],
  ];
  for (const [name, params] of calls) {
    await expect(tool(name)(params)).rejects.toThrow(TILDE_REFUSAL);
  }
  // A bare `~` is the same shorthand for the same directory.
  await expect(tool("read")({ path: "~" })).rejects.toThrow(TILDE_REFUSAL);
  // Pi strips a leading `@` before it resolves anything (its path-utils), so
  // the shorthand wearing one is the same shorthand.
  await expect(tool("read")({ path: "@~/.pi/auth.json" })).rejects.toThrow(TILDE_REFUSAL);
});

test("a tilde inside a path is not the shorthand, and still resolves", async () => {
  const { slots, tool } = await stageGround();
  await tool("write")({ path: "$TMP/a~b.txt", content: "held\n" });
  await expect(readFile(join(slots.TMP, "a~b.txt"), "utf8")).resolves.toBe("held\n");
});
