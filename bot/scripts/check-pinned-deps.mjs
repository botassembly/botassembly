#!/usr/bin/env node
// Every dependency is exact-pinned (ADR 0003, ADR 0010): a bare version,
// never a range. `^`, `~`, wildcards, and tags all fail here.
import { readFileSync } from "node:fs";

const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const bad = [];
for (const field of ["dependencies", "devDependencies"]) {
  for (const [name, version] of Object.entries(pkg[field] ?? {})) {
    if (!EXACT.test(version)) bad.push(`${field}: ${name}@${version}`);
  }
}

if (bad.length > 0) {
  console.error(
    "pinned-deps: not exact-pinned:\n" + bad.map((b) => `  ${b}`).join("\n"),
  );
  process.exit(1);
}
console.log("pinned-deps: all exact.");
