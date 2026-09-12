#!/usr/bin/env node
// The gate that teaches. Attempt one cannot know the suffix — the stage never
// names it — so this gate's words are the only way the agent learns it, and
// what the agent does next is what S2 measures.
import { readFileSync } from "node:fs";

const held = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (!held.word.endsWith("-TAUGHT")) {
  console.log('The value of "word" must end with -TAUGHT.');
  console.log("Keep the value exactly as it is and append -TAUGHT to the end of it, then write the file again.");
  process.exit(1);
}
