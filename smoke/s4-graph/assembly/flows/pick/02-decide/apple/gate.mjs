#!/usr/bin/env node
import { readFileSync } from "node:fs";

const held = readFileSync(process.argv[2], "utf8");
if (!/^apple$/mu.test(held) || !held.includes("PRIMED-MARKER-9F2C")) {
  console.log("Write two lines: `apple`, then the line of `$INPUT/prepare.txt` beginning PRIMED-MARKER-, copied exactly.");
  process.exit(1);
}
