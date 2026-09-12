// Ticket 0130 — `bot assembly link /etc/passwd` succeeded, `list` showed the
// entry unmarked, `bot status` counted it, and `bot check passwd` then said
// "Name an assembly that exists." about an entry the tool had just listed.
//
// The decision this file pins: the link stays permissive and every READER tells
// the truth, because what a link is pointing at is read at every read and
// nothing about it is recorded. management.md: "A link whose target is not an
// assembly — gone, or never one — is broken. `list` says so, `link` says so of
// the link it just made, and a run of it refuses `assembly-unknown` ... The
// state is read at every read, so writing the `ASSEMBLY.md` afterwards makes
// the link sound with no further command."
//
// The falsifications, chosen so each could have gone the other way:
// - the BROKEN mark is not constant: the same tree is linked sound, rots, and
//   is marked; a bare directory is linked marked and becomes sound.
// - the sentence is not constant: a name the home holds nothing at keeps the
//   old one, and both spellings of the target — `<name>` and `<name>/<flow>` —
//   reach the new one, because the entry stands at `<name>` in either.
import { semanticCheck } from "./semantic-check.ts";
import { rm, mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { boundaryFor, cleanup, lines, scratch, text, tree, type Capture } from "./assembly-home.ts";
import { main } from "../src/cli.ts";

afterEach(cleanup);

const HELD = "assembly-unknown  %s\n  Name an assembly; what is there is not one.\n";
const NONE = "assembly-unknown  %s\n  Name an assembly that exists.\n";

/** `bot check <target>` refused, with the whole stderr byte for byte. */
async function refuses(target: string, shape: string, boundary: Parameters<typeof main>[1], capture: Capture): Promise<void> {
  await expect(semanticCheck([ target], boundary)).resolves.toBe(2);
  expect(text(capture.out)).toBe("");
  expect(text(capture.err)).toBe(shape.replace("%s", target));
  capture.out.length = 0;
  capture.err.length = 0;
}

test("link — a target that is not an assembly is linked, marked BROKEN by link and by list, refused in plain words, and goes sound when the ASSEMBLY.md is written", async () => {
  const held = await scratch("bot-link-not-an-assembly-");
  const later = join(held.root, "code", "dev-bot");
  await mkdir(later, { recursive: true });
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);

  // The success line is the line `list` would print, mark and all.
  expect(await lines(["assembly", "link", later], boundary, capture, 0)).toEqual([`dev-bot  linked  -> ${later}  BROKEN`]);
  expect(await lines(["assembly", "list"], boundary, capture, 0)).toEqual([`dev-bot  linked  -> ${later}  BROKEN`]);

  // `bot status` still counts the entry: the home holds it, `list` says what
  // state it is in, and 0081 already ruled that a broken link is weighed like a
  // live one rather than skipped. The count is a census, not a health report.

  await refuses("dev-bot", HELD, boundary, capture);
  await refuses("dev-bot/main", HELD, boundary, capture);

  // Read at every read: the author who links first and writes second needs no
  // second command. Nothing was recorded at link time that could have drifted.
  await tree(later, "Dev.");
  expect(await lines(["assembly", "list"], boundary, capture, 0)).toEqual([`dev-bot  linked  -> ${later}`]);
  await expect(semanticCheck([ "dev-bot/main"], boundary)).resolves.toBe(0);
});

test("link — a target that rots after linking is marked and refused the same way, by either spelling of the name", async () => {
  const held = await scratch("bot-link-rotted-");
  const live = await tree(join(held.root, "code", "dev-bot"), "Dev.");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);

  // Sound at link time — no mark, and `check` renders the flow through it.
  expect(await lines(["assembly", "link", live], boundary, capture, 0)).toEqual([`dev-bot  linked  -> ${live}`]);
  expect(await lines(["assembly", "check", "dev-bot/main"], boundary, capture, 0)).toHaveLength(1);

  await rm(live, { recursive: true });
  expect(await lines(["assembly", "list"], boundary, capture, 0)).toEqual([`dev-bot  linked  -> ${live}  BROKEN`]);
  await refuses("dev-bot", HELD, boundary, capture);
  await refuses("dev-bot/main", HELD, boundary, capture);
});

// The other side of 0130's unification, and a real behavior change: the walk
// used to ask `existsSync` where the resolver asked `lstatExists`, so a
// directory whose `ASSEMBLY.md` is a DANGLING symlink was invisible to `list`
// and `status` while `bot check` on it went straight in and refused. One
// question now, so the entry is listed and refused instead of hidden and
// refused — and the refusal is the reader's own, the graph's ban on symbolic
// links inside an assembly (graph.md), which is a fault a person can act on.
// Hiding it was the worse half: an entry no listing admits to is one `remove`
// also refuses by name.
test("the walk asks the resolver's question: a directory whose ASSEMBLY.md is a dangling symlink is listed and refused, not invisible", async () => {
  const held = await scratch("bot-walk-dangling-marker-");
  const dangler = join(held.home, "assemblies", "dangler");
  await mkdir(join(dangler, "flows", "main"), { recursive: true });
  await symlink(join(held.root, "gone", "ASSEMBLY.md"), join(dangler, "ASSEMBLY.md"));
  await writeFile(join(dangler, "flows", "main", "FLOW.md"), "---\ndescription: main flow\n---\n");
  await writeFile(join(dangler, "flows", "main", "01-work.md"), "---\n---\nDo the work.\n");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);

  expect(await lines(["assembly", "list"], boundary, capture, 0)).toEqual(["dangler  installed  local copy"]);
  expect(text(capture.err)).toBe("");
  await expect(semanticCheck([ "dangler"], boundary)).resolves.toBe(2);
  expect(text(capture.err)).toBe("symlink  ASSEMBLY.md\n  Replace the symbolic link with an assembly entry.\n");
});

test("a name nothing stands at still says the assembly does not exist, and an explicit path is judged the same way as a name", async () => {
  const held = await scratch("bot-link-nothing-");
  const plain = join(held.root, "code", "plain");
  await mkdir(plain, { recursive: true });
  await writeFile(join(plain, "notes.txt"), "not an assembly\n");
  const capture: Capture = { out: [], err: [] };
  const boundary = boundaryFor(held.root, held.home, capture);

  await refuses("nowhere", NONE, boundary, capture);
  await refuses("nowhere/main", NONE, boundary, capture);
  await refuses(join(held.root, "code", "nope"), NONE, boundary, capture);
  await refuses(plain, HELD, boundary, capture);
});
