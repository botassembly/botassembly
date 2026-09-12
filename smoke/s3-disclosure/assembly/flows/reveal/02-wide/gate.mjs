#!/usr/bin/env node
// No stage-level skill here, so the flow's `passphrase` is what flattens into
// $SKILLS and BASIL is the only word this stage can honestly report.
import { readFileSync } from "node:fs";

const held = readFileSync(process.argv[2], "utf8");
const wrong = ["AMBER", "CEDAR"].filter((word) => held.includes(word));
if (!held.includes("BASIL") || wrong.length > 0) {
  console.log("Write only the secret word named in `$SKILLS/passphrase/SKILL.md`, on one line, and nothing else.");
  process.exit(1);
}
