#!/usr/bin/env node
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { constants, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { verifyCoverageSummary } from "./verify-coverage-summary.mjs";

function resultOf(promise) {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error }),
  );
}

function call(operation) {
  return resultOf(Promise.resolve().then(operation));
}

function causeMessage(cause) {
  const message = cause instanceof Error ? cause.message : String(cause);
  return message.slice(0, 2_048);
}

function defaultDiagnostic(message) {
  process.stderr.write(`${message}\n`);
}

function defaultAnnouncement(result) {
  process.stdout.write(`coverage-summary: ${String(result.files)} production modules across four dimensions.\n`);
}

export function waitForClose(child) {
  return new Promise((accept, reject) => {
    let childError;
    child.once("error", (error) => { childError ??= error; });
    child.once("close", (code, signal) => {
      if (childError !== undefined) reject(childError);
      else accept({ code, signal });
    });
  });
}

export function coverageProducer(reportsDirectory, options = {}) {
  const workingDirectory = options.workingDirectory ?? process.cwd();
  const spawnChild = options.spawnChild ?? spawn;
  const executable = process.execPath;
  const arguments_ = [
    resolve(workingDirectory, "node_modules/vitest/vitest.mjs"),
    "run",
    "--coverage",
    `--coverage.reportsDirectory=${reportsDirectory}`,
  ];
  return waitForClose(spawnChild(executable, arguments_, { cwd: workingDirectory, stdio: "inherit" }));
}

export class CoveragePublicationError extends Error {
  constructor(publicationCause, stagingCleanupCause) {
    super(causeMessage(publicationCause), { cause: publicationCause });
    this.name = "CoveragePublicationError";
    this.publicationCause = publicationCause;
    this.stagingCleanupCause = stagingCleanupCause;
  }
}

export async function publishCoverageSummary(summaryFile, retainedDirectory, operations = {}) {
  const copy = operations.copyFile ?? copyFile;
  const renameFile = operations.renameFile ?? rename;
  const remove = operations.removeFile ?? ((path) => rm(path, { force: true }));
  await (operations.makeDirectory ?? mkdir)(retainedDirectory, { recursive: true });
  const staging = join(retainedDirectory, `.coverage-summary-${randomUUID()}.json`);
  const publication = await call(() => copy(summaryFile, staging).then(() => renameFile(staging, join(retainedDirectory, "coverage-summary.json"))));
  if (publication.ok) return;
  const stagingCleanup = await call(() => remove(staging));
  if (!stagingCleanup.ok) throw new CoveragePublicationError(publication.error, stagingCleanup.error);
  throw publication.error;
}

export async function runCoverage(options = {}) {
  const workingDirectory = options.workingDirectory ?? process.cwd();
  const sourceRoot = options.sourceRoot ?? resolve(workingDirectory, "src");
  const retainedDirectory = options.retainedDirectory ?? resolve(workingDirectory, "coverage");
  const createOwnedDirectory = options.createOwnedDirectory ?? (() => mkdtemp(join(tmpdir(), "bot-coverage-")));
  const producer = options.producer ?? ((directory) => coverageProducer(directory, { workingDirectory }));
  const verifier = options.verifier ?? verifyCoverageSummary;
  const publisher = options.publisher ?? publishCoverageSummary;
  const cleanup = options.cleanup ?? ((path) => rm(path, { recursive: true, force: true }));
  const diagnostic = options.diagnostic ?? defaultDiagnostic;
  const announcement = options.announcement ?? defaultAnnouncement;
  const report = async (message) => { await call(() => diagnostic(message)); };

  const creation = await call(createOwnedDirectory);
  if (!creation.ok) {
    await report(`coverage setup failed: ${causeMessage(creation.error)}`);
    return 1;
  }
  const ownedDirectory = creation.value;
  const summaryFile = join(ownedDirectory, "coverage-summary.json");
  let exitCode = 0;
  let announcementFailure;
  let cleanupResult;

  try {
    const production = await call(() => producer(ownedDirectory));
    if (!production.ok) {
      await report(`coverage producer failed: ${causeMessage(production.error)}`);
      exitCode = 1;
    } else if (production.value.signal !== null) {
      await report(`coverage producer failed: killed by ${production.value.signal}`);
      exitCode = 128 + (constants.signals[production.value.signal] ?? 0);
    } else if (production.value.code !== 0) {
      exitCode = production.value.code ?? 1;
    }

    if (exitCode === 0) {
      const verification = await call(() => verifier(summaryFile, sourceRoot));
      if (!verification.ok) {
        await report(`coverage verification failed: ${causeMessage(verification.error)}`);
        exitCode = 1;
      } else {
        const publication = await call(() => publisher(summaryFile, retainedDirectory));
        if (!publication.ok) {
          const publicationCause = publication.error instanceof CoveragePublicationError
            ? publication.error.publicationCause
            : publication.error;
          await report(`coverage publication failed: ${causeMessage(publicationCause)}`);
          if (publication.error instanceof CoveragePublicationError) {
            await report(`coverage staging cleanup failed: ${causeMessage(publication.error.stagingCleanupCause)}`);
          }
          exitCode = 1;
        } else {
          const announced = await call(() => announcement(verification.value));
          if (!announced.ok) announcementFailure = announced.error;
        }
      }
    }
  } finally {
    cleanupResult = await call(() => cleanup(ownedDirectory));
  }

  if (!cleanupResult.ok) {
    await report(`coverage cleanup failed: ${causeMessage(cleanupResult.error)}`);
    if (exitCode === 0) exitCode = 1;
  }
  if (announcementFailure !== undefined) throw announcementFailure;
  return exitCode;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCoverage();
}
