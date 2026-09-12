#!/usr/bin/env node
// The rewrite has to survive into the output, or nothing downstream can prove
// the before hook crossed into what the agent saw.
import { readFileSync } from "node:fs";

if (!readFileSync(process.argv[2], "utf8").includes("PRIMED-MARKER-9F2C")) {
  console.log("The output must contain the line beginning PRIMED-MARKER- from `$INPUT/request.txt`, copied exactly.");
  process.exit(1);
}
