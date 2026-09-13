#!/usr/bin/env node
// The loop's arithmetic, enforced rather than hoped for. The stop condition is
// "three lines", so the number of repeats is only knowable if each repeat adds
// exactly one line — and a model that wrote all three at once would end the loop
// on repeat 1 with every assertion about repeats reading as a model failure
// rather than the fixture's.
//
// This is the doctrine's deterministic component: the gate, not the prose,
// settles the shape. It reads `$INPUT` out of the environment because that is
// where the slots are (flow.ts hands a gate the stage's own environment), and
// the output out of argv[2], which is the only argument a gate is given.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const linesOf = (path) => (existsSync(path) ? readFileSync(path, "utf8") : "").split("\n").filter((line) => line.trim().length > 0);

const input = process.env["INPUT"] ?? "";
const token = (linesOf(join(input, "request.txt"))[0] ?? "").trim();
const previous = linesOf(join(input, "add.txt"));
const held = linesOf(process.argv[2] ?? "");

const kept = held.slice(0, previous.length).every((line, index) => line.trim() === previous[index]?.trim());
if (held.length !== previous.length + 1 || !kept || held.at(-1)?.trim() !== token) {
  console.log(previous.length === 0
    ? "The output must hold exactly one line: the token from `$INPUT/request.txt`, and nothing else."
    : `The output must hold every line of \`$INPUT/add.txt\` in its own order, and then exactly one more line holding the token from \`$INPUT/request.txt\` and nothing else.`);
  process.exit(1);
}
