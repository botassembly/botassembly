import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { main, type CliBoundary } from "./initialized-cli.ts";
import type { DriverClock } from "../src/process.ts";

const clock: DriverClock = {
  milliseconds: () => performance.now(),
  timestamp: () => new Date().toISOString(),
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
};

test("a gate with an escaped output pipe ends as a machinery fault rather than passing", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-gate-incomplete-capture-"));
  const home = join(root, "home"), stage = join(home, "assemblies/review/flows/main/01-work");
  const helper = join(root, "escape.cjs"), escapedPid = join(root, "escaped.pid"), gate = join(stage, "gate");
  await mkdir(stage, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(home, "assemblies/review/flows/main/FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(stage, "STAGE.md"), "---\n---\nWork.\n"),
    writeFile(helper, [
      'const { spawn } = require("node:child_process");',
      'const { writeFileSync } = require("node:fs");',
      'const child = spawn("/bin/sh", ["-c", "sleep 10"], { detached: true, stdio: ["ignore", process.stdout, process.stderr] });',
      'writeFileSync(process.argv[2], String(child.pid));',
      'child.unref();',
    ].join("\n")),
    writeFile(gate, `#!/bin/sh\nexec '${process.execPath}' '${helper}' '${escapedPid}'\n`),
  ]);
  await chmod(gate, 0o755);
  const faux = fauxProvider({ tokensPerSecond: 10_000, models: [{ id: "faux-1" }] });
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "the work" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
  ]);
  const stdout: Buffer[] = [], stderr: Buffer[] = [];
  const boundary: CliBoundary = {
    cwd: root, env: { ...process.env, BOT_HOME: home, XDG_CACHE_HOME: join(root, "cache") },
    stdinIsTTY: true, stderrIsTTY: false, readStdin: () => Promise.resolve(Buffer.alloc(0)),
    stdout: (bytes) => { stdout.push(Buffer.from(bytes)); }, stderr: (bytes) => { stderr.push(Buffer.from(bytes)); },
    clock, models,
  };
  let escaped: number | undefined;
  try {
    await expect(main(["run", "start", "review/main", "the request"], boundary)).resolves.toBe(2);
    escaped = Number(await readFile(escapedPid, "utf8"));
    const run = (await readdir(join(home, "runs")))[0] ?? "";
    const events = (await readFile(join(home, "runs", run, "record.jsonl"), "utf8"))
      .trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events).toContainEqual(expect.objectContaining({
      event: "stage_end", exit: 2, cause: "fault",
      reason: "flows/main/01-work/gate did not close its captured output after exiting.",
    }));
    expect(events).toContainEqual(expect.objectContaining({ event: "check", check: "gate", exit: 0 }));
  } finally {
    if (escaped !== undefined) { try { process.kill(-escaped, "SIGKILL"); } catch { /* already gone */ } }
    await rm(root, { recursive: true, force: true });
  }
});
