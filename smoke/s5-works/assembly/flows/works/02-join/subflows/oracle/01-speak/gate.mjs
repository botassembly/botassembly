#!/usr/bin/env node
import { readFileSync } from "node:fs";

if (!readFileSync(process.argv[2], "utf8").includes("DELTA")) {
  console.log("Write only the secret word named in `$SKILLS/passphrase/SKILL.md`, on one line, and nothing else.");
  process.exit(1);
}
