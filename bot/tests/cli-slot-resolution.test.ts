// Ticket 0084 — one supplied slot, one base.
//
// `bot check` validated a supplied relative slot against the CALLER'S CWD
// (check.ts `lstatExists(resolve(dir, value))`) while the stage was handed the
// raw string and resolved it against the WORKDIR (`$PWD`, from `--in`). With
// `--in` the two are different directories, so one `--doc notes.md` named two
// files: the one the check verb swore existed, and the one the agent read.
// Both verbs exited 0 and nothing said so.
//
// The base is now the caller's cwd on both sides, chosen because that is
// already the base every other path on the command line resolves against —
// `--home` (invocation.ts `resolveHome`), `--in` itself, and an `@task` file —
// and because it is the only base a shell user can predict: they typed the
// path standing where they stand.
//
// Four legs. The first is the divergence. The other three exist so the fix
// cannot have simply moved it: no `--in` must be unchanged, an ABSOLUTE
// supplied slot must land where it always did (a fix that resolved absolute
// paths against the workdir would be a new bug wearing this one's clothes),
// and the file the check verb validated must be the file the run reads even
// when the workdir holds nothing by that name.
import { semanticCheck } from "./semantic-check.ts";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { at, queue, realBoundary, router, tempRoots, writes, type Seen } from "./cli-boundary.ts";

const { scratch, cleanup } = tempRoots();
afterEach(async () => { await cleanup(); });

const WORK = "Workmarker: read the document you were given.";
const ROOT = "ROOT COPY -- the file bot check validated";
const WORKDIR = "WORKDIR COPY -- the file the stage used to be given";

function reads(path: string) {
  return fauxAssistantMessage([fauxToolCall("read", { path })], { stopReason: "toolUse" });
}

async function assembly(home: string): Promise<void> {
  const base = join(home, "assemblies/review");
  await mkdir(join(base, "flows/main"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(base, "ASSEMBLY.md"), "---\nintelligence: default\nslots:\n  doc: The document to work from.\n---\nA review assembly.\n"),
    writeFile(join(base, "flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(base, "flows/main/01-work.md"), `---\n---\n${WORK}\n`),
  ]);
}

interface Fixture { root: string; held: Parameters<typeof main>[1]; seen: Seen[]; errors: Buffer[] }

/** Two `notes.md` — one beside the caller, one in the workdir — unless
 *  `decoy` is off, which is the variant where the workdir holds none. */
async function fixture(prefix: string, decoy = true): Promise<Fixture> {
  const { root, home } = await scratch(prefix);
  await Promise.all([mkdir(join(root, "sub"), { recursive: true }), assembly(home)]);
  await Promise.all([
    writeFile(join(root, "notes.md"), ROOT),
    ...(decoy ? [writeFile(join(root, "sub/notes.md"), WORKDIR)] : []),
  ]);
  const errors: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, [], errors);
  const seen: Seen[] = [];
  queue(faux, router({
    [WORK]: (round) => {
      if (round === 1) return reads("$DOC");
      if (round === 2) return writes("$OUTPUT", "done");
      return fauxAssistantMessage("stage done");
    },
  }, seen), 24);
  return { root, held, seen, errors };
}

/** What the `read` tool handed back: the second round's messages carry the
 *  first round's tool result, and that is the only honest witness of which
 *  file the runtime actually opened. */
function delivered(seen: Seen[]): string {
  return at(seen, 1).messages;
}

test("a supplied relative slot names the caller's file, not the workdir's — bot check and bot run agree", async () => {
  const { held, seen, errors } = await fixture("bot-slot-base-relative-");
  await expect(semanticCheck([ "review/main", "--doc", "notes.md", "--in", "sub", "the request"], held)).resolves.toBe(0);
  await expect(main(["run", "start", "review/main", "--doc", "notes.md", "--in", "sub", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(errors).toString()).toBe("");
  expect(delivered(seen)).toContain(ROOT);
  expect(delivered(seen)).not.toContain(WORKDIR);
});

test("without --in nothing changed: the caller's file is still the one delivered", async () => {
  const { held, seen, errors } = await fixture("bot-slot-base-no-in-");
  await expect(semanticCheck([ "review/main", "--doc", "notes.md", "the request"], held)).resolves.toBe(0);
  await expect(main(["run", "start", "review/main", "--doc", "notes.md", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(errors).toString()).toBe("");
  expect(delivered(seen)).toContain(ROOT);
  expect(delivered(seen)).not.toContain(WORKDIR);
});

test("an absolute supplied slot resolves to itself, workdir or no workdir", async () => {
  const { root, held, seen, errors } = await fixture("bot-slot-base-absolute-");
  const doc = join(root, "notes.md");
  await expect(semanticCheck([ "review/main", "--doc", doc, "--in", "sub", "the request"], held)).resolves.toBe(0);
  await expect(main(["run", "start", "review/main", "--doc", doc, "--in", "sub", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(errors).toString()).toBe("");
  expect(delivered(seen)).toContain(ROOT);
  expect(delivered(seen)).not.toContain(WORKDIR);
});

test("the workdir holding no such name is not a mid-run tool error: the validated file is the delivered file", async () => {
  const { held, seen, errors } = await fixture("bot-slot-base-missing-", false);
  await expect(semanticCheck([ "review/main", "--doc", "notes.md", "--in", "sub", "the request"], held)).resolves.toBe(0);
  await expect(main(["run", "start", "review/main", "--doc", "notes.md", "--in", "sub", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(errors).toString()).toBe("");
  expect(delivered(seen)).toContain(ROOT);
  expect(delivered(seen)).not.toContain("not_found");
});
