#!/usr/bin/env node
// The join has to carry both branches AND the child's answer: fan-out
// delivery and the delegation round-trip, judged on one file.
import { readFileSync } from "node:fs";

const held = readFileSync(process.argv[2], "utf8");
const missing = ["TOKEN-ALPHA-7K3", "TOKEN-BETA-4M8", "DELTA"].filter((word) => !held.includes(word));
if (missing.length > 0) {
  console.log(`The output is missing: ${missing.join(", ")}.`);
  console.log("Write three lines: the token from `$INPUT/alpha.txt`, the token from `$INPUT/beta.txt`, and the word the `oracle` helper answered with.");
  process.exit(1);
}
