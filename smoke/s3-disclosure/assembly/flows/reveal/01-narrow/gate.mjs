#!/usr/bin/env node
// The narrowest scope wins: this stage carries its own `passphrase`, so CEDAR
// is the only word it can honestly report (skills.md, "names collide by
// overriding, narrowest first").
import { readFileSync } from "node:fs";

const held = readFileSync(process.argv[2], "utf8");
const wrong = ["AMBER", "BASIL"].filter((word) => held.includes(word));
if (!held.includes("CEDAR") || wrong.length > 0) {
  console.log("Write only the secret word named in `$SKILLS/passphrase/SKILL.md`, on one line, and nothing else.");
  process.exit(1);
}
