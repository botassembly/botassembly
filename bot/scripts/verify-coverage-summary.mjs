#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DIMENSIONS = ["lines", "branches", "functions", "statements"];

function normalized(path) {
  return path.split(sep).join("/");
}

async function productionFiles(directory, base = dirname(directory)) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await productionFiles(path, base));
    else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(normalized(relative(base, path)));
  }
  return files.sort();
}

function validDimension(value) {
  return typeof value === "object" && value !== null
    && ["total", "covered", "skipped", "pct"].every((name) => typeof value[name] === "number" && Number.isFinite(value[name]));
}

function requireDimensions(value, label) {
  if (typeof value !== "object" || value === null) throw new Error(`${label} has no valid coverage`);
  for (const dimension of DIMENSIONS) {
    if (!validDimension(value[dimension])) throw new Error(`${label} has no valid ${dimension} coverage`);
  }
}

function boundedList(label, entries) {
  if (entries.length === 0) return undefined;
  const shown = entries.slice(0, 10).join(", ");
  const omitted = entries.length > 10 ? `; ${String(entries.length - 10)} more omitted` : "";
  return `${label} ${shown}${omitted}`;
}

export async function verifyCoverageSummary(summaryFile, sourceRoot) {
  let summary;
  try {
    summary = JSON.parse(await readFile(summaryFile, "utf8"));
  } catch (cause) {
    throw new Error("coverage summary is not readable JSON", { cause });
  }
  if (typeof summary !== "object" || summary === null || Array.isArray(summary)) {
    throw new Error("coverage summary has no valid total coverage");
  }
  if (typeof summary.total !== "object" || summary.total === null) {
    throw new Error("summary has no valid total coverage");
  }
  requireDimensions(summary.total, "summary total");

  const projectRoot = dirname(resolve(sourceRoot));
  const inventory = await productionFiles(resolve(sourceRoot), projectRoot);
  const reported = Object.keys(summary)
    .filter((key) => key !== "total")
    .map((key) => normalized(relative(projectRoot, resolve(key))))
    .sort();
  const missing = inventory.filter((path) => !reported.includes(path));
  const unexpected = reported.filter((path) => !inventory.includes(path));
  const mismatch = [boundedList("missing", missing), boundedList("unexpected", unexpected)].filter(Boolean).join("; ");
  if (mismatch.length > 0) throw new Error(`coverage summary inventory mismatch: ${mismatch}`);

  for (const [key, value] of Object.entries(summary)) {
    if (key === "total") continue;
    const path = normalized(relative(projectRoot, resolve(key)));
    requireDimensions(value, path);
  }
  return { files: inventory.length };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await verifyCoverageSummary(resolve("coverage/coverage-summary.json"), resolve("src"));
    process.stdout.write(`coverage-summary: ${String(result.files)} production modules across four dimensions.\n`);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "coverage summary verification failed";
    process.stderr.write(`${message.slice(0, 2_048)}\n`);
    process.exitCode = 1;
  }
}
