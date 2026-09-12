import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm as realRm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { mapping } from "../src/model.ts";
import { invokeCli } from "./invoke.ts";

const interruption = vi.hoisted(() => ({
  target: "", armed: false, namespace: "", namespaceArmed: false, intentCleanupArmed: false,
  swapAfterLstat: 0, replacement: "", displaced: "",
  afterQuarantineRename: undefined as undefined | (() => Promise<void>),
  releaseFailureArmed: false, compromiseArmed: false,
}));

vi.mock("proper-lockfile", async (importOriginal) => {
  const original = await importOriginal<typeof import("proper-lockfile")>();
  return {
    ...original,
    lock: async (...arguments_: Parameters<typeof original.lock>) => {
      const release = await original.lock(...arguments_);
      if (interruption.compromiseArmed) {
        interruption.compromiseArmed = false;
        await release();
        arguments_[1]?.onCompromised?.(Object.assign(new Error("removal lock compromised"), { code: "ECOMPROMISED" }));
        return () => Promise.resolve();
      }
      return async () => {
        await release();
        if (interruption.releaseFailureArmed) {
          interruption.releaseFailureArmed = false;
          throw Object.assign(new Error("removal lock release failed"), { code: "EIO" });
        }
      };
    },
  };
});

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...original,
    lstat: async (...arguments_: Parameters<typeof original.lstat>) => {
      const observed = await original.lstat(...arguments_);
      if (arguments_[0].toString() === interruption.target && interruption.swapAfterLstat > 0) {
        interruption.swapAfterLstat -= 1;
        if (interruption.swapAfterLstat === 0) {
          await original.rename(interruption.target, interruption.displaced);
          await original.rename(interruption.replacement, interruption.target);
        }
      }
      return observed;
    },
    rename: async (...arguments_: Parameters<typeof original.rename>) => {
      await original.rename(...arguments_);
      const afterQuarantineRename = interruption.afterQuarantineRename;
      if (arguments_[1].toString().includes("/.bot-removing-") && afterQuarantineRename !== undefined) {
        await afterQuarantineRename();
      }
    },
    rm: async (...arguments_: Parameters<typeof original.rm>) => {
      if (!arguments_[0].toString().includes("/.bot-removing-") || !interruption.armed) return original.rm(...arguments_);
      interruption.armed = false;
      await original.rm(join(arguments_[0].toString(), "ASSEMBLY.md"));
      throw Object.assign(new Error("interrupted removal"), { code: "EIO", path: arguments_[0] });
    },
    rmdir: async (...arguments_: Parameters<typeof original.rmdir>) => {
      if (arguments_[0].toString() !== interruption.namespace || !interruption.namespaceArmed) return original.rmdir(...arguments_);
      interruption.namespaceArmed = false;
      throw Object.assign(new Error("interrupted namespace pruning"), { code: "EIO", path: interruption.namespace });
    },
    unlink: async (...arguments_: Parameters<typeof original.unlink>) => {
      if (!arguments_[0].toString().includes("/.bot-removed-") || !interruption.intentCleanupArmed) return original.unlink(...arguments_);
      interruption.intentCleanupArmed = false;
      throw Object.assign(new Error("interrupted intent cleanup"), { code: "EIO", path: arguments_[0] });
    },
  };
});

const roots: string[] = [];
afterEach(async () => {
  interruption.target = "";
  interruption.armed = false;
  interruption.namespace = "";
  interruption.namespaceArmed = false;
  interruption.intentCleanupArmed = false;
  interruption.swapAfterLstat = 0;
  interruption.replacement = "";
  interruption.displaced = "";
  interruption.afterQuarantineRename = undefined;
  interruption.releaseFailureArmed = false;
  interruption.compromiseArmed = false;
  await Promise.all(roots.splice(0).map((root) => realRm(root, { recursive: true, force: true })));
});

async function assembly(root: string, purpose: string): Promise<string> {
  await mkdir(join(root, "flows", "main"), { recursive: true });
  await Promise.all([
    writeFile(join(root, "ASSEMBLY.md"), `---\nintelligence: default\n---\n${purpose}\n`),
    writeFile(join(root, "flows", "main", "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(root, "flows", "main", "01-work.md"), "---\n---\nWork.\n"),
  ]);
  return root;
}

async function fixture(): Promise<{ root: string; home: string; source: string }> {
  const root = await mkdtemp(join(tmpdir(), "bot-assembly-remove-contract-"));
  roots.push(root);
  const home = join(root, "home"), source = await assembly(join(root, "source"), "Source.");
  await mkdir(join(home, "assemblies"), { recursive: true });
  return { root, home, source };
}

function object(text: string): Record<string, unknown> {
  const held: unknown = JSON.parse(text);
  if (!mapping(held)) throw new Error("Expected an object.");
  return held;
}

function commands(text: string): Array<Record<string, unknown>> {
  const data = object(text)["data"];
  if (!mapping(data) || !Array.isArray(data["commands"])) throw new Error("Expected capability commands.");
  return data["commands"].filter(mapping);
}

async function quarantine(home: string): Promise<string> {
  const entries = (await readdir(join(home, "assemblies"))).filter((entry) => entry.startsWith(".bot-removing-"));
  expect(entries).toHaveLength(1);
  return join(home, "assemblies", entries[0] ?? "missing");
}

test("assembly remove reports copied and linked installation kinds without touching other trees", async () => {
  const { home, source } = await fixture();
  const copied = await assembly(join(home, "assemblies", "team", "review"), "Copy.");
  const neighbor = await assembly(join(home, "assemblies", "team", "other"), "Other.");
  await symlink(source, join(home, "assemblies", "live"));

  const installed = await invokeCli(["assembly", "remove", "team/review", "--json"], { home });
  expect(installed.code, installed.err).toBe(0);
  expect(object(installed.out)).toEqual({
    schemaVersion: 1, kind: "bot.assembly.remove",
    data: { name: "team/review", kind: "installed", removed: true },
  });
  expect(Buffer.byteLength(installed.out)).toBeLessThanOrEqual(8_192);
  await expect(lstat(copied)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(readFile(join(neighbor, "ASSEMBLY.md"), "utf8")).resolves.toContain("Other.");

  const linked = await invokeCli(["assembly", "remove", "live", "-j"], { home });
  expect(linked.code, linked.err).toBe(0);
  expect(object(linked.out)).toEqual({
    schemaVersion: 1, kind: "bot.assembly.remove",
    data: { name: "live", kind: "linked", removed: true },
  });
  await expect(lstat(join(home, "assemblies", "live"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(readFile(join(source, "ASSEMBLY.md"), "utf8")).resolves.toContain("Source.");

  const hostile = `paint\u001b[31m`;
  await assembly(join(home, "assemblies", hostile), "Hostile.");
  expect(await invokeCli(["assembly", "remove", hostile], { home })).toEqual({
    code: 0, out: "paint\\x1b[31m  removed\n", err: "",
  });
  await expect(readFile(join(neighbor, "ASSEMBLY.md"), "utf8")).resolves.toContain("Other.");
});

test("assembly remove returns structured refusals for missing and unsafe targets", async () => {
  const { home } = await fixture();
  const missing = await invokeCli(["assembly", "remove", "missing", "--json"], { home });
  expect(missing).toMatchObject({ code: 2, out: "" });
  expect(object(missing.err)).toMatchObject({
    schemaVersion: 1, kind: "error",
    error: { operation: "assembly.remove", code: "request-invalid", cause: "assembly-refused", retryable: false,
      details: { refusals: [{ code: "assembly-unknown", path: "missing" }], omitted: 0 } },
  });

  const unsafe = await invokeCli(["assembly", "remove", "../../outside", "--json"], { home });
  expect(unsafe).toMatchObject({ code: 2, out: "" });
  expect(object(unsafe.err)).toMatchObject({
    error: { operation: "assembly.remove", cause: "assembly-refused",
      details: { refusals: [{ code: "request-invalid", path: "../../outside" }] } },
  });
});

test("an interrupted copied removal reports failure and a later removal retries the same target", async () => {
  const { home, source } = await fixture();
  const target = await assembly(join(home, "assemblies", "review"), "Review.");
  interruption.target = target;
  interruption.armed = true;

  const interrupted = await invokeCli(["assembly", "remove", "review", "--json"], { home });
  expect(interrupted).toMatchObject({ code: 4, out: "" });
  expect(object(interrupted.err)).toMatchObject({
    schemaVersion: 1, kind: "error",
    error: { operation: "assembly.remove", code: "dependency-failed", cause: "removal-failed", retryable: true },
  });
  await expect(lstat(target)).rejects.toMatchObject({ code: "ENOENT" });
  const partial = await quarantine(home);
  await expect(lstat(join(partial, "ASSEMBLY.md"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(readFile(join(partial, "flows", "main", "01-work.md"), "utf8")).resolves.toContain("Work.");
  expect((await invokeCli(["assembly", "install", source, "--name", "review", "--json"], { home })).code).toBe(2);
  await expect(readFile(join(source, "ASSEMBLY.md"), "utf8")).resolves.toContain("Source.");

  const retried = await invokeCli(["assembly", "remove", "review", "--json"], { home });
  expect(retried.code, retried.err).toBe(0);
  expect(object(retried.out)).toMatchObject({ data: { name: "review", kind: "installed", removed: true } });
  await expect(lstat(target)).rejects.toMatchObject({ code: "ENOENT" });
});

test("a failed namespace prune remains retryable after the copied target is gone", async () => {
  const { home } = await fixture();
  const target = await assembly(join(home, "assemblies", "team", "review"), "Review.");
  interruption.namespace = join(home, "assemblies", "team");
  interruption.namespaceArmed = true;

  const interrupted = await invokeCli(["assembly", "remove", "team/review", "--json"], { home });
  expect(interrupted).toMatchObject({ code: 4, out: "" });
  expect(object(interrupted.err)).toMatchObject({
    error: { operation: "assembly.remove", code: "dependency-failed", cause: "removal-failed", retryable: true },
  });
  await expect(lstat(target)).rejects.toMatchObject({ code: "ENOENT" });

  const retried = await invokeCli(["assembly", "remove", "team/review", "--json"], { home });
  expect(retried.code, retried.err).toBe(0);
  expect(object(retried.out)).toMatchObject({ data: { name: "team/review", kind: "installed", removed: true } });
  await expect(lstat(interruption.namespace)).rejects.toMatchObject({ code: "ENOENT" });
});

test("an interrupted removal refuses a replacement at the same name", async () => {
  const { root, home } = await fixture();
  const target = await assembly(join(home, "assemblies", "review"), "Original.");
  interruption.target = target;
  interruption.armed = true;
  expect((await invokeCli(["assembly", "remove", "review", "--json"], { home })).code).toBe(4);

  const replacement = await assembly(join(root, "replacement"), "Replacement.");
  await rename(replacement, target);
  const refused = await invokeCli(["assembly", "remove", "review", "--json"], { home });
  expect(refused).toMatchObject({ code: 5, out: "" });
  expect(object(refused.err)).toMatchObject({
    error: { operation: "assembly.remove", code: "integrity-failed", cause: "removal-state-invalid", retryable: false },
  });
  await expect(readFile(join(target, "ASSEMBLY.md"), "utf8")).resolves.toContain("Replacement.");
  expect((await readdir(join(home, "assemblies"))).filter((entry) => entry.startsWith(".bot-removing-"))).toEqual([]);
});

test("a target swapped immediately after identity observation is never deleted", async () => {
  const { root, home } = await fixture();
  const target = await assembly(join(home, "assemblies", "review"), "Original.");
  interruption.target = target;
  interruption.replacement = await assembly(join(root, "replacement"), "Replacement.");
  interruption.displaced = join(root, "displaced-original");
  interruption.swapAfterLstat = 1;

  const refused = await invokeCli(["assembly", "remove", "review", "--json"], { home });
  expect(refused).toMatchObject({ code: 5, out: "" });
  expect(object(refused.err)).toMatchObject({
    error: { operation: "assembly.remove", code: "integrity-failed", cause: "removal-state-invalid", retryable: false },
  });
  await expect(lstat(target)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(readFile(join(await quarantine(home), "ASSEMBLY.md"), "utf8")).resolves.toContain("Replacement.");
  await expect(readFile(join(interruption.displaced, "ASSEMBLY.md"), "utf8")).resolves.toContain("Original.");
});

test("a concurrent remove cannot report success while another caller owns the quarantine", async () => {
  const { home } = await fixture();
  const target = await assembly(join(home, "assemblies", "review"), "Review.");
  let claimed: () => void = () => undefined, resume: () => void = () => undefined;
  const quarantineClaimed = new Promise<void>((resolve) => { claimed = resolve; });
  const continueRemoval = new Promise<void>((resolve) => { resume = resolve; });
  interruption.afterQuarantineRename = async () => { claimed(); await continueRemoval; };

  const firstPending = invokeCli(["assembly", "remove", "review", "--json"], { home });
  await quarantineClaimed;
  const concurrent = await invokeCli(["assembly", "remove", "review", "--json"], { home });
  const quarantineRemained = (await readdir(join(home, "assemblies"))).some((entry) => entry.startsWith(".bot-removing-"));
  resume();
  const first = await firstPending;

  expect(concurrent).toMatchObject({ code: 4, out: "" });
  expect(object(concurrent.err)).toMatchObject({
    error: { operation: "assembly.remove", code: "dependency-failed", cause: "removal-busy", retryable: true },
  });
  expect(quarantineRemained).toBe(true);
  expect(first.code, first.err).toBe(0);
  expect(object(first.out)).toMatchObject({ data: { name: "review", kind: "installed", removed: true } });
  await expect(lstat(target)).rejects.toMatchObject({ code: "ENOENT" });
  expect((await readdir(join(home, "assemblies"))).some((entry) => entry.startsWith(".bot-removing-"))).toBe(false);
});

test("install reports busy while removal settles its durable intent", async () => {
  const { home, source } = await fixture();
  const target = await assembly(join(home, "assemblies", "review"), "Review.");
  let claimed: () => void = () => undefined, resume: () => void = () => undefined;
  const quarantineClaimed = new Promise<void>((resolve) => { claimed = resolve; });
  const continueRemoval = new Promise<void>((resolve) => { resume = resolve; });
  interruption.afterQuarantineRename = async () => { claimed(); await continueRemoval; };

  const removalPending = invokeCli(["assembly", "remove", "review", "--json"], { home });
  await quarantineClaimed;
  const concurrent = await invokeCli(["assembly", "install", source, "--name", "review", "--json"], { home });
  resume();
  const removed = await removalPending;

  expect(concurrent).toMatchObject({ code: 4, out: "" });
  expect(object(concurrent.err)).toMatchObject({
    error: { operation: "assembly.install", code: "dependency-failed", cause: "creation-busy", retryable: true },
  });
  expect(removed.code, removed.err).toBe(0);
  await expect(lstat(target)).rejects.toMatchObject({ code: "ENOENT" });
});

test("remove reports busy while update settles its replacement", async () => {
  const { home, source } = await fixture();
  expect((await invokeCli(["assembly", "install", source, "--name", "review", "--json"], { home })).code).toBe(0);
  await writeFile(join(source, "ASSEMBLY.md"), "---\nintelligence: default\n---\nUpdated source.\n");
  let moved: () => void = () => undefined, resume: () => void = () => undefined;
  const targetMovedAside = new Promise<void>((resolve) => { moved = resolve; });
  const continueUpdate = new Promise<void>((resolve) => { resume = resolve; });

  const updatePending = invokeCli(["assembly", "update", "review", "--json"], {
    home,
    afterAssemblyUpdateAside: async () => { moved(); await continueUpdate; },
  });
  await targetMovedAside;
  const concurrent = await invokeCli(["assembly", "remove", "review", "--json"], { home });
  resume();
  const updated = await updatePending;

  expect(concurrent).toMatchObject({ code: 4, out: "" });
  expect(object(concurrent.err)).toMatchObject({
    error: { operation: "assembly.remove", code: "dependency-failed", cause: "removal-busy", retryable: true },
  });
  expect(updated.code, updated.err).toBe(0);
  await expect(readFile(join(home, "assemblies", "review", "ASSEMBLY.md"), "utf8")).resolves.toContain("Updated source.");
});

test("update retains its published outcome when the shared lock release fails", async () => {
  const { home, source } = await fixture();
  expect((await invokeCli(["assembly", "install", source, "--name", "review", "--json"], { home })).code).toBe(0);
  await writeFile(join(source, "ASSEMBLY.md"), "---\nintelligence: default\n---\nUpdated source.\n");
  interruption.releaseFailureArmed = true;

  const result = await invokeCli(["assembly", "update", "review", "--json"], { home });

  expect(result).toMatchObject({ code: 2, err: "" });
  expect(object(result.out)).toMatchObject({
    kind: "bot.assembly.update",
    data: { outcomes: [{ name: "review", state: "updated" }] },
  });
  await expect(readFile(join(home, "assemblies", "review", "ASSEMBLY.md"), "utf8")).resolves.toContain("Updated source.");
});

for (const kind of ["installed", "linked"] as const) {
  test(`${kind} creation retains its published result when the shared lock release fails`, async () => {
    const { home, source } = await fixture();
    interruption.releaseFailureArmed = true;
    const verb = kind === "installed" ? "install" : "link";

    const result = await invokeCli(["assembly", verb, source, "--name", "review", "--json"], { home });

    expect(result).toMatchObject({ code: 2, err: "" });
    expect(object(result.out)).toEqual({
      schemaVersion: 1, kind: `bot.assembly.${verb}`,
      data: { name: "review", kind, changed: true },
    });
    const target = join(home, "assemblies", "review");
    if (kind === "installed") {
      await expect(readFile(join(target, "ASSEMBLY.md"), "utf8")).resolves.toContain("Source.");
    } else {
      expect((await lstat(target)).isSymbolicLink()).toBe(true);
      await expect(readFile(join(source, "ASSEMBLY.md"), "utf8")).resolves.toContain("Source.");
    }
  });
}

for (const failure of ["release", "compromise"] as const) {
  test(`a removal ${failure} failure retains durable retry state and never reports false success`, async () => {
    const { home } = await fixture();
    const target = await assembly(join(home, "assemblies", "review"), "Review.");
    if (failure === "release") interruption.releaseFailureArmed = true;
    else interruption.compromiseArmed = true;

    const failed = await invokeCli(["assembly", "remove", "review", "--json"], { home });
    expect(failed).toMatchObject({ code: 4, out: "" });
    expect(object(failed.err)).toMatchObject({
      error: { operation: "assembly.remove", code: "dependency-failed", retryable: true },
    });
    await expect(lstat(target)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await readdir(join(home, "assemblies"))).filter((entry) => entry.startsWith(".bot-removed-"))).toHaveLength(1);
    expect((await readdir(join(home, "assemblies"))).filter((entry) => entry.startsWith(".bot-removing-"))).toEqual([]);

    const retried = await invokeCli(["assembly", "remove", "review", "--json"], { home });
    expect(retried.code, retried.err).toBe(0);
    expect(object(retried.out)).toMatchObject({ data: { name: "review", kind: "installed", removed: true } });
    expect((await readdir(join(home, "assemblies"))).filter((entry) => entry.startsWith(".bot-remove"))).toEqual([]);
  });
}

test("creation reports malformed removal state before a target collision", async () => {
  const { home, source } = await fixture();
  const target = await assembly(join(home, "assemblies", "review"), "Review.");
  interruption.target = target;
  interruption.armed = true;
  expect((await invokeCli(["assembly", "remove", "review", "--json"], { home })).code).toBe(4);
  const intentName = (await readdir(join(home, "assemblies"))).find((entry) => entry.startsWith(".bot-remove-"));
  expect(intentName).toBeDefined();
  const intent = join(home, "assemblies", intentName ?? "missing");
  await realRm(intent);
  await mkdir(intent);
  await assembly(target, "Replacement.");

  for (const [verb, json] of [["install", true], ["link", true], ["install", false]] as const) {
    const result = await invokeCli(["assembly", verb, source, "--name", "review", ...(json ? ["--json"] : [])], { home });
    expect(result).toMatchObject({ code: 5, out: "" });
    if (json) {
      expect(object(result.err)).toMatchObject({
        error: { operation: `assembly.${verb}`, code: "integrity-failed", cause: "removal-state-invalid", retryable: false },
      });
    } else {
      expect(result.err).toContain("removal record is invalid");
    }
  }
});

test("a removal retries after target and namespace deletion finish before intent cleanup", async () => {
  const { home } = await fixture();
  const target = await assembly(join(home, "assemblies", "team", "review"), "Review.");
  interruption.intentCleanupArmed = true;

  const interrupted = await invokeCli(["assembly", "remove", "team/review", "--json"], { home });
  expect(interrupted).toMatchObject({ code: 4, out: "" });
  await expect(lstat(target)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(lstat(join(home, "assemblies", "team"))).rejects.toMatchObject({ code: "ENOENT" });

  const retried = await invokeCli(["assembly", "remove", "team/review", "--json"], { home });
  expect(retried.code, retried.err).toBe(0);
  expect(object(retried.out)).toMatchObject({ data: { name: "team/review", kind: "installed", removed: true } });
});

test("the remove descriptor and generated help publish the current contract", async () => {
  const { home } = await fixture();
  const descriptors = commands((await invokeCli(["capabilities", "--json"], { home })).out);
  expect(descriptors.find((row) => row["operation"] === "assembly.remove")).toEqual({
    operation: "assembly.remove", command: ["assembly", "remove"], output: { kind: "bot.assembly.remove", schemaVersion: 1 },
    modes: ["markdown", "json"], home: "writes", mutates: true, network: "never",
    options: [
      { name: "--home", aliases: [], type: "path", repeatable: false, default: "BOT_HOME, then platform default" },
      { name: "--json", aliases: ["-j"], type: "boolean", repeatable: false },
    ], limits: { humanErrorBytes: 2_048, resultBytes: 8_192 },
  });

  const help = await invokeCli(["assembly", "remove", "--help"], { home });
  expect(help.code, help.err).toBe(0);
  expect(help.out).toContain("usage: bot assembly remove <name>");
  expect(help.out).toContain("Output: bot.assembly.remove@1");
});
