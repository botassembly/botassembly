// Ticket 0126 — the clauses `request-invalid`'s row promises that nothing else
// in the suite bound. The row (refusals.md, Resolution) says the code covers
// every command line bot cannot act on. Verb dispatch, a name the home already
// holds, a name that leaves the home and the one-way request were already
// witnessed (cli-assembly-management.test.ts, conformance refuse/request-invalid);
// these three were not — the code at cli.ts's usage() and at invocation.ts's
// dangling-option fault could both be swapped for another and the whole suite
// stayed green. A row that promises behavior no test binds is a row that will
// drift away from the runtime silently.
import { semanticCheck } from "./semantic-check.ts";
import { afterEach, expect, test } from "vitest";
import { boundaryFor, cleanup, scratch, text, type Capture } from "./assembly-home.ts";
import { main } from "../src/cli.ts";

afterEach(cleanup);

test("request-invalid — an unknown command, a command's argument shape, and an option given no value", async () => {
  const held = await scratch("bot-request-invalid-");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);

  // A command bot does not have. Byte-exact, in the management pins' style:
  // this sentence has to keep naming the commands, or it stops telling the
  // reader what to ask for instead.
  await expect(main(["frobnicate"], boundary)).resolves.toBe(2);
  // REDESIGN (ticket 0085): `busy` replaces the retired `worktree` predicate,
  // and the implemented `request` verb belongs in every fallback list.
  expect(text(capture.err)).toMatch(/^request-invalid  frobnicate\n  Use assembly check,/u);
  for (const command of ["assembly check", "auth list", "home busy", "model list", "run start", "run events"]) {
    expect(text(capture.err)).toMatch(new RegExp(`\\b${command}\\b`, "u"));
  }
  expect(text(capture.err)).not.toContain("worktree");
  capture.err.length = 0;

  // A command given the wrong arguments — one inspection shape standing for the
  // six. Code and path only, which is what the corpus asserts on.
  await expect(main(["run", "list", "extra"], boundary)).resolves.toBe(2);
  expect(text(capture.err)).toContain("Run list does not accept extra.");
  capture.err.length = 0;

  // An option given no value. The unknown target refuses in the same breath, so
  // this reads the fault's own line rather than the stream: the path is the
  // dangling option, not the target.
  await expect(semanticCheck([ "demo", "--in"], boundary)).resolves.toBe(2);
  expect(text(capture.err)).toContain("request-invalid  --in");
});

test("a top-level --home names the place where the option belongs", async () => {
  const held = await scratch("bot-request-invalid-home-");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);
  const expected = "request-invalid  --home\n  Put --home DIR after a command that accepts it. Example: bot run list --home ./bot-home.\n";

  for (const args of [
    ["--home", "./bot-home", "status"],
    ["--home"],
    ["--home", "--json", "status"],
    ["--home", "--help"],
  ]) {
    await expect(main(args, boundary)).resolves.toBe(2);
    expect(text(capture.out)).toBe("");
    expect(text(capture.err)).toBe(expected);
    capture.err.length = 0;
  }
});
