// Ticket 0036: HTML comments are author-to-human (assembly.md) — stripped
// from every body before it reaches an agent; a comment-only body is empty.
// These tests drive the REAL defaultGating (no createGating override).
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { readAssembly } from "../src/assembly.ts";
import { main, type CliBoundary } from "./initialized-cli.ts";
import type { DriverClock } from "../src/process.ts";

const roots: string[] = [];
const clock: DriverClock = {
  milliseconds: () => performance.now(),
  timestamp: () => new Date().toISOString(),
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function realBoundary(root: string, home: string, output: Buffer[], errors: Buffer[]) {
  const faux = fauxProvider({ tokensPerSecond: 10_000, models: [{ id: "faux-1" }] });
  const models = createModels();
  models.setProvider(faux.provider);
  const held: CliBoundary = {
    cwd: root,
    env: { ...process.env, BOT_HOME: home, PWD: root, XDG_CACHE_HOME: join(root, "cache") },
    stdinIsTTY: true,
    stderrIsTTY: false,
    readStdin: () => Promise.resolve(Buffer.alloc(0)),
    stdout: (bytes) => { output.push(Buffer.from(bytes)); },
    stderr: (bytes) => { errors.push(Buffer.from(bytes)); },
    clock,
    models,
  };
  return { held, faux };
}

test("a stage body's HTML comment never reaches the harness system prompt", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-comment-prompt-"));
  roots.push(root);
  const home = join(root, "home");
  const base = join(home, "assemblies/plain");
  await mkdir(join(base, "flows/main"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(base, "ASSEMBLY.md"), "---\nintelligence: default\n---\nPlain assembly. <!-- purpose aside -->\n"),
    writeFile(join(base, "flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(base, "flows/main/01-only.md"), "---\n---\nDo the work.\n<!-- secret aside\nfor the maintainer -->\nAnswer plainly.\n"),
  ]);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  let captured = "";
  faux.setResponses([
    (context) => {
      captured = context.systemPrompt ?? "";
      return fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "the answer" })], { stopReason: "toolUse" });
    },
    fauxAssistantMessage("done"),
  ]);

  await expect(main(["run", "start", "plain/main", "the request"], held)).resolves.toBe(0);
  expect(captured).toContain("Do the work.");
  expect(captured).toContain("Answer plainly.");
  expect(captured).not.toContain("secret aside");
  expect(captured).not.toContain("purpose aside");
  expect(captured).not.toContain("<!--");
});

test("a comment-only LOOP.md body stays a fixed-count loop, exit 0", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-comment-loop-"));
  roots.push(root);
  const home = join(root, "home");
  const base = join(home, "assemblies/looper");
  await mkdir(join(base, "flows/main/01-cycle"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(base, "ASSEMBLY.md"), "---\nintelligence: default\n---\nLooping assembly.\n"),
    writeFile(join(base, "flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(base, "flows/main/01-cycle/LOOP.md"), "---\nrepeat: 2\n---\n<!-- run it twice, no question -->\n"),
    writeFile(join(base, "flows/main/01-cycle/01-work.md"), "---\n---\nDo one pass.\n"),
    writeFile(join(base, "flows/main/02-tail.md"), "---\n---\nSummarize.\n"),
  ]);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "pass one" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "pass two" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "summary" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
  ]);

  await expect(main(["run", "start", "looper/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stdout).toString()).toBe("summary");
});

test("a comment-only CHOOSE.md body faults body-missing, not alternative-mismatch", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-comment-choose-"));
  roots.push(root);
  await mkdir(join(root, "flows/change/01-decide"), { recursive: true });
  await Promise.all([
    writeFile(join(root, "ASSEMBLY.md"), "---\n{}\n---\nAssembly.\n"),
    writeFile(join(root, "flows/change/FLOW.md"), "---\ndescription: does a thing\n---\n"),
    writeFile(join(root, "flows/change/01-decide/CHOOSE.md"), "---\n---\n<!-- decide later which instruction to write -->\n"),
    writeFile(join(root, "flows/change/01-decide/escalate.md"), "---\n---\nDo the work.\n"),
    writeFile(join(root, "flows/change/01-decide/patch.md"), "---\n---\nDo the work.\n"),
    writeFile(join(root, "flows/change/02-report.md"), "---\n---\nDo the work.\n"),
  ]);
  const parsed = readAssembly(root, {});
  expect(parsed.faults.map(({ code }) => code)).not.toContain("alternative-mismatch");
  expect(parsed.faults).toContainEqual(expect.objectContaining({ code: "body-missing", path: "flows/change/01-decide/CHOOSE.md" }));
});
