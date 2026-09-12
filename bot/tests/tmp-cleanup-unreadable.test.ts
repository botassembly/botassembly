// Ticket 0129 — fixtures may make a directory unreadable, but settlement still
// owns the parent and must remove that temporary debris.
import { chmod, lstat, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { afterEach, expect, test } from "vitest";
import { outputOf } from "./hostile.ts";
import { assembly, events, flow, roots, stage, start, type Script } from "./flow-harness.ts";

const sealed: string[] = [];
const isRoot = process.getuid?.() === 0;

afterEach(async () => {
  await Promise.all(sealed.splice(0).map((path) => chmod(path, 0o700).catch(() => undefined)));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test.skipIf(isRoot)("stage settlement removes a temporary subtree it cannot read", async () => {
  const main = flow("main", "flows/main", [stage("flows/main/01-work.md", "work")]);
  let temporary = "";
  const scripts = new Map<string, Script>([["main:01-work:1", (context) => [
    async () => {
      temporary = context.tmpPath;
      const blocked = join(temporary, "fuzz-fixture");
      await mkdir(blocked);
      await writeFile(join(blocked, "case.txt"), "unreadable fixture\n");
      await chmod(blocked, 0o000);
      sealed.push(blocked);
      await writeFile(outputOf(context), "finished\n");
      return fauxAssistantMessage("finished with disposable fixture");
    },
    () => fauxAssistantMessage("finish after the temporary-files warning"),
  ]]]);

  const run = await start(main, assembly(main), scripts, { retries: new Map([["main:01-work:1", 0]]) });
  await expect(run.result).resolves.toMatchObject({ exit: 0, cause: "success" });
  await expect(lstat(temporary)).rejects.toMatchObject({ code: "ENOENT" });
});

// A parent we cannot alter prevents removal — and here it also blocks the
// output write, so the stage itself faults. Ticket 0144 supersedes 0129's
// displaced reason: the stage's own fault stands, and the teardown failure is
// its own recorded tmp_teardown diagnostic, still naming the directory.
test.skipIf(isRoot)("stage settlement names the temporary directory it cannot remove", async () => {
  const main = flow("main", "flows/main", [stage("flows/main/01-work.md", "work")]);
  let temporary = "";
  const scripts = new Map<string, Script>([["main:01-work:1", (context) => [async () => {
    temporary = context.tmpPath;
    await writeFile(join(temporary, "left-behind.txt"), "cannot remove this\n");
    // Removing a nonempty directory needs access to its parent. Unlike its
    // unreadable child above, this is a door cleanup cannot reopen itself.
    const parent = dirname(temporary);
    await chmod(parent, 0o000);
    sealed.push(parent);
    await writeFile(outputOf(context), "finished\n");
    return fauxAssistantMessage("finished with inaccessible temporary files");
  }, () => fauxAssistantMessage("finish after the temporary-files warning")]]]);

  const run = await start(main, assembly(main), scripts, { retries: new Map([["main:01-work:1", 0]]) });
  const result = await run.result;
  expect(result).toMatchObject({ exit: 2, cause: "fault" });
  const record = await events(run.writer.writer.recordPath);
  const teardown = record.find((event) => event["event"] === "tmp_teardown");
  expect(teardown).toMatchObject({ event: "tmp_teardown", stage: "01-work" });
  expect(String(teardown?.["reason"])).toContain(temporary);
});
