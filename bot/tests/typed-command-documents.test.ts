import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { assemblyCheckDocument, assemblyListDocument, capabilitiesDocument, homeBusyDocument, homeBusyReading, homeShowDocument, intelligenceListDocument } from "../src/public-admin-readings.ts";
import { runCheckDocument, runChecklistDocument, runEventsDocument, runListDocument, runSearchDocument, runShowDocument } from "../src/public-run-readings.ts";
import { assemblyInstallDocument, assemblyLinkDocument, assemblyRemoveDocument, assemblyUpdateDocument, authImportDocument, authLoginDocument, authLogoutDocument, runResumeDocument, runStartDocument } from "../src/public-mutation-readings.ts";
import { builtPackage } from "./built-package.ts";

test("the built package exposes typed administrative and mutation documents", async () => {
  const { packageRoot, remove } = await builtPackage("bot-typed-documents-red-");
  try {
    const admin = await import(`${packageRoot}/dist/public-admin-readings.js`) as Record<string, unknown>;
    const mutation = await import(`${packageRoot}/dist/public-mutation-readings.js`) as Record<string, unknown>;
    expect(typeof admin["capabilitiesDocument"]).toBe("function");
    expect(typeof mutation["runStartDocument"]).toBe("function");
  } finally {
    await remove();
  }
});

test("all 21 typed functions settle once through hermetic command boundaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-typed-documents-all-")), home = join(root, "home"), env = { PATH: process.env["PATH"] };
  await mkdir(home, { mode: 0o700 });
  try {
    const query = { assemblies: [], flows: [], states: [], causes: [], fields: ["id" as const], count: false, limit: 20 };
    const readings = await Promise.all([
      assemblyCheckDocument(home, "missing/main", undefined, {}, root, env), assemblyListDocument(home, {}, root, env),
      capabilitiesDocument(), homeBusyDocument(home, root, root, env), homeShowDocument(home, root, env), intelligenceListDocument(home, root, env),
      runCheckDocument(home, "missing", "gate", {}, root, env), runChecklistDocument(home, "missing", {}, root, env),
      runEventsDocument(home, "missing", {}, root, env), runListDocument(home, query), runSearchDocument(home, "absent", {}, root, env),
      runShowDocument(home, "missing", env), assemblyInstallDocument(home, root, { name: ".." }, root, env),
      assemblyLinkDocument(home, root, { name: ".." }, root, env), assemblyRemoveDocument(home, "missing", root, env),
      assemblyUpdateDocument(home, undefined, root, env), authImportDocument(join(root, "missing-auth.json"), root, env),
      authLoginDocument("", { readLine: () => Promise.resolve("") }, root, env), authLogoutDocument("", {}, root, env),
      runStartDocument(home, "", undefined, {}, root, env), runResumeDocument(home, "", {}, root, env),
    ]);
    expect(readings).toHaveLength(21);
    for (const reading of readings) {
      expect(reading.exit).toBe(reading.command.exit);
      const bytes = reading.kind === "document" ? reading.command.stdout : reading.command.stderr;
      expect(JSON.parse(bytes.toString())).toEqual(reading.kind === "document" ? reading.document : reading.error);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the public home busy document returns its longer common refusal unchanged", async () => {
  const root = tmpdir();
  const command = await homeBusyReading(root, "-bad", { json: true }, root, {});
  expect(command).toMatchObject({ exit: 2, stdout: Buffer.alloc(0) });
  expect(command.stderr.length).toBeGreaterThan(65);
  const typed = await homeBusyDocument(root, "-bad", root, {});
  expect(typed).toMatchObject({ kind: "error", exit: 2, command });
  if (typed.kind !== "error") throw new Error("Expected the home busy refusal.");
  expect(Buffer.from(`${JSON.stringify(typed.error)}\n`)).toEqual(command.stderr);
});
