// Ticket 0077 — three preflight holes, each of which used to land AFTER a run
// was born, and each of which now refuses (or is derived safely) before it.
//
// 1. The request extension came off the whole `@`-argument, so a dot in a
//    parent folder put a separator in the request's name: `@notes.d/task` gave
//    the extension `d/task` and the name `request.d/task`, which run.ts writes
//    with `join(runDirectory, name)` immediately after record birth — ENOENT
//    into a subdirectory that does not exist, with the record already open.
//    The review called this a path escape; it is not, and the tests below say
//    so positively: every derived name is one path segment.
// 2. Nothing bounded `timeout` between the option ladder and process.ts's
//    `input.clock.setTimeout`, whose delay node truncates to 32 bits. The
//    largest authored timeouts therefore fired at once — the opposite of what
//    was authored. `documents.ts` carries the measurement behind the bound.
// 3. An unknown slim-schema type and an unresolvable JSON `$ref` both compiled
//    for the first time while a finished output was being checked — after the
//    model had been paid. Both now compile during validation, so `bot check`
//    refuses them and no run is born.
import { semanticCheck } from "./semantic-check.ts";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main } from "../src/cli.ts";
import { TIMEOUT_MAX } from "../src/documents.ts";
import { parseInvocation } from "../src/invocation.ts";
import { hashBytes } from "../src/record.ts";
import { events, realBoundary, start, tempRoots, writes } from "./cli-boundary.ts";

const { scratch, cleanup } = tempRoots();
afterEach(async () => { await cleanup(); });

/** The smallest assembly that can run: one file-form stage in one flow. */
async function oneStage(home: string): Promise<void> {
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(flow, "01-work.md"), "---\n---\nDo the work.\n"),
  ]);
}

/** The same assembly with a folder-form stage carrying one schema file. */
async function schemaStage(home: string, name: string, body: string): Promise<void> {
  const stage = join(home, "assemblies/review/flows/main/01-work");
  await mkdir(stage, { recursive: true });
  await Promise.all([
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(home, "assemblies/review/flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(stage, "STAGE.md"), "---\n---\nDo the work.\n"),
    writeFile(join(stage, name), body),
  ]);
}

function answers(text: string) {
  return [writes("$OUTPUT", text), fauxAssistantMessage("done")];
}

// ---------------------------------------------------------------- leg 1 ----

// Every row is an `@`-argument and the extension the request must keep. The
// third column is what the OLD derivation produced, kept so the regression is
// legible: it read the suffix off the whole argument.
const EXTENSIONS: { argument: string; extension: string; was: string }[] = [
  { argument: "@notes.d/task", extension: "txt", was: "d/task" },
  { argument: "@a.b/../../x", extension: "txt", was: "/x" },
  { argument: "@a.b/c", extension: "txt", was: "b/c" },
  { argument: "@a/b.c.d/e", extension: "txt", was: "d/e" },
  { argument: "@dir.d/task.md", extension: "md", was: "md" },
  { argument: "@task", extension: "txt", was: "txt" },
  { argument: "@.hidden", extension: "txt", was: "hidden" },
  { argument: "@x.", extension: "txt", was: "" },
];

// The falsification the ticket asks for: not "different from before" but SAFE.
// Three properties hold of every row at once, and the middle one is what a
// derivation that merely deleted the first separator would fail — stripping
// one slash out of `d/task` gives `dtask`, a single segment of plain
// characters that the argument does not end with, so row 1 reddens.
test("leg 1: the request extension is a plain suffix of the task file's own name, never a path", () => {
  for (const { argument, extension } of EXTENSIONS) {
    const held = parseInvocation(`review ${argument}`, "/nonexistent", {});
    const name = `request.${held.requestExtension}`;
    expect({ argument, extension: held.requestExtension }).toEqual({ argument, extension });
    // A suffix the file really carries, not one rewritten out of the argument.
    expect(extension === "txt" || argument.endsWith(`.${extension}`)).toBe(true);
    // One path segment: the name of a file, in the run directory, full stop.
    expect(name).toBe(basename(name));
    expect(name).not.toContain("/");
    expect(join("/runs/r1", name)).toBe(`/runs/r1/${name}`);
  }
});

// The old code's own witness that `..` never reached the suffix, which is why
// the escape claim was rejected: the suffix begins after the LAST dot, so a
// `..` inside it would contain a dot of its own.
test("leg 1: no dotted parent folder ever produced a suffix that could climb out", () => {
  for (const { was } of EXTENSIONS) expect(was).not.toContain("..");
});

test("leg 1: a task file under a dotted folder is written as request.txt, and the run completes", async () => {
  const { root, home } = await scratch("bot-preflight-request-");
  await oneStage(home);
  await mkdir(join(root, "notes.d"), { recursive: true });
  const body = "act on the dotted-folder request\n";
  await writeFile(join(root, "notes.d/task"), body);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses(answers("the answer"));

  // Before this ticket the request name was `request.d/task`, so this write
  // threw ENOENT one line after the record was opened.
  const code = await main(["run", "start", "review/main", "@notes.d/task"], held);
  expect([code, Buffer.concat(stderr).toString()]).toEqual([0, ""]);

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  expect(await readdir(join(home, "runs", run))).toContain("request.txt");
  expect((await readFile(join(home, "runs", run, "request.txt"))).equals(Buffer.from(body))).toBe(true);

  const held2 = await events(join(home, "runs", run, "record.jsonl"));
  expect(held2[0]).toMatchObject({
    event: "run_start",
    request: { path: "request.txt", sha256: hashBytes(Buffer.from(body)), via: "task" },
  });
  // And the name the first stage is handed is that same single segment.
  expect(start(held2, "01-work")?.["received"]).toMatchObject([{ name: "request.txt" }]);
});

// Ticket 0121 (C9) — the same leg, one bound further. The suffix is a single
// path segment now, but nothing bounded its LENGTH, and `request.` plus the
// suffix is one directory entry: POSIX NAME_MAX is 255 bytes, so an extension
// of 248 makes a name of 256 and `writeFile` threw ENAMETOOLONG one line after
// the record was opened — the same shape as the ENOENT above.
//
// The window is narrow and it is real. The task file itself is a directory
// entry too, so the longest extension that can exist on disk is 253 (`t.` plus
// 253 = 255); the longest that FITS is 247 (`request.` plus 247 = 255). Every
// extension from 248 to 253 is a task file a person can make and a request
// name the filesystem cannot hold. A 300-character extension is not reachable
// at all: the task file cannot be created.
const NAME_MAX = 255;
/** The longest extension whose request name still fits, and one past it. */
const FITS = "a".repeat(NAME_MAX - "request.".length);
const OVER = `${FITS}a`;

test("leg 1: the longest request name that fits is written, and the run completes", async () => {
  const { root, home } = await scratch("bot-preflight-name-fits-");
  await oneStage(home);
  const body = "act on the long-suffix request\n";
  await writeFile(join(root, `t.${FITS}`), body);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses(answers("the answer"));

  const code = await main(["run", "start", "review/main", `@t.${FITS}`], held);
  expect([code, Buffer.concat(stderr).toString()]).toEqual([0, ""]);

  const run = (await readdir(join(home, "runs")))[0] ?? "";
  const name = `request.${FITS}`;
  expect(Buffer.byteLength(name)).toBe(NAME_MAX);
  expect(await readdir(join(home, "runs", run))).toContain(name);
  expect((await readFile(join(home, "runs", run, name))).equals(Buffer.from(body))).toBe(true);
});

test("leg 1: an extension one byte past what the name can hold refuses at every rung, before a run is born", async () => {
  const { root, home } = await scratch("bot-preflight-name-over-");
  await oneStage(home);
  await writeFile(join(root, `t.${OVER}`), "act on the too-long request\n");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);
  faux.setResponses(answers("the answer"));

  await expect(semanticCheck([ "review/main", `@t.${OVER}`], held)).resolves.toBe(2);
  expect(Buffer.concat(stderr).toString()).toContain(`value-invalid  t.${OVER}`);
  expect(Buffer.concat(stdout).toString()).toBe("");

  stderr.length = 0;
  await expect(main(["run", "start", "review/main", `@t.${OVER}`], held)).resolves.toBe(2);
  expect(Buffer.concat(stderr).toString()).toContain(`value-invalid  t.${OVER}`);
  await expect(readdir(join(home, "runs"))).resolves.toEqual([]);
});

// ---------------------------------------------------------------- leg 2 ----

// The bound is node's, not the specification's — invocation.md says only
// "`timeout` is at least 1" — so it is pinned against the 32-bit limit it was
// measured from rather than restated as a number.
test("leg 2: the ceiling is the last whole second that fits node's 32-bit timer", () => {
  expect(TIMEOUT_MAX * 1_000).toBeLessThanOrEqual(2_147_483_647);
  expect((TIMEOUT_MAX + 1) * 1_000).toBeGreaterThan(2_147_483_647);
});

test("leg 2: a timeout at the ceiling is honoured at the command rung and the run finishes", async () => {
  const { root, home } = await scratch("bot-preflight-timeout-in-");
  await oneStage(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, stdout, stderr);

  await expect(semanticCheck([ "review/main", "--timeout", String(TIMEOUT_MAX), "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toContain(`timeout=${String(TIMEOUT_MAX)}@command`);

  // And it is a budget, not a fuse: the stage runs to a sealed answer rather
  // than being terminated by a timer that fired on the first tick.
  faux.setResponses(answers("the answer"));
  stdout.length = 0;
  await expect(main(["run", "start", "review/main", "--timeout", String(TIMEOUT_MAX), "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stdout).toString()).toBe("the answer");
});

test("leg 2: one second past the ceiling refuses at every rung, before a run is born", async () => {
  const { root, home } = await scratch("bot-preflight-timeout-out-");
  await oneStage(home);
  const over = String(TIMEOUT_MAX + 1);
  await writeFile(join(root, "task.md"), `---\ntimeout: ${over}\n---\nDo the work.\n`);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = realBoundary(root, home, stdout, stderr);

  await expect(semanticCheck([ "review/main", "--timeout", over, "the request"], held)).resolves.toBe(2);
  expect(Buffer.concat(stderr).toString()).toContain("value-invalid  --timeout");

  stderr.length = 0;
  await expect(main(["run", "start", "review/main", "--timeout", over, "the request"], held)).resolves.toBe(2);
  expect(Buffer.concat(stderr).toString()).toContain("value-invalid  --timeout");
  await expect(readdir(join(home, "runs"))).resolves.toEqual([]);

  // The authored rungs are bounded by the same constant, not only the flag.
  stderr.length = 0;
  await expect(main(["run", "start", "review/main", "@task.md"], held)).resolves.toBe(2);
  expect(Buffer.concat(stderr).toString()).toContain("value-invalid  task.md");
  await expect(readdir(join(home, "runs"))).resolves.toEqual([]);
});

// ---------------------------------------------------------------- leg 3 ----

// Where each of these asserts an EMPTY `runs/` rather than an absent one: since
// ADR 0016 birth reserves the name and makes the run directory before anything
// reads the assembly, because the assembly is copied INTO the run and it is the
// copy that is validated. A refusal takes the run directory away again, so "no
// run is born" is still exactly what is witnessed.
const SCHEMA_PATH = "flows/main/01-work/schema";

test("leg 3: an unknown slim-schema type refuses at bot check, and no run is born", async () => {
  const { root, home } = await scratch("bot-preflight-slim-");
  await schemaStage(home, "schema.md", "---\ntitle: str\ncount: nope\n---\n");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = realBoundary(root, home, stdout, stderr);

  // The point of check: it refuses without a model, a run, or a record.
  await expect(semanticCheck([ "review/main", "the request"], held)).resolves.toBe(2);
  expect(Buffer.concat(stderr).toString()).toContain(`schema-invalid  ${SCHEMA_PATH}.md`);
  expect(Buffer.concat(stdout).toString()).toBe("");

  stderr.length = 0;
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(2);
  expect(Buffer.concat(stderr).toString()).toContain(`schema-invalid  ${SCHEMA_PATH}.md`);
  await expect(readdir(join(home, "runs"))).resolves.toEqual([]);
});

test("leg 3: a JSON schema that only fails when its $ref is resolved refuses at bot check", async () => {
  const { root, home } = await scratch("bot-preflight-ref-");
  // A valid 2020-12 document by every meta-schema rule: it fails at compile.
  await schemaStage(home, "schema.json", JSON.stringify({ $ref: "#/definitions/nope" }));
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = realBoundary(root, home, stdout, stderr);

  await expect(semanticCheck([ "review/main", "the request"], held)).resolves.toBe(2);
  expect(Buffer.concat(stderr).toString()).toContain(`schema-invalid  ${SCHEMA_PATH}.json`);

  stderr.length = 0;
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(2);
  expect(Buffer.concat(stderr).toString()).toContain(`schema-invalid  ${SCHEMA_PATH}.json`);
  await expect(readdir(join(home, "runs"))).resolves.toEqual([]);
});

// The other direction, so the two refusals above are not simply "schemas are
// refused now": every slim type the specification lists still validates, and
// so does an ordinary JSON schema.
test("leg 3: sound schemas of both kinds still pass check", async () => {
  const { root, home } = await scratch("bot-preflight-sound-");
  await schemaStage(home, "schema.md", "---\na: str\nb: int\nc: float\nd: bool\ne: list\nf: date\ng:\n---\n");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = realBoundary(root, home, stdout, stderr);
  await expect(semanticCheck([ "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");

  const second = await scratch("bot-preflight-sound-json-");
  await schemaStage(second.home, "schema.json", JSON.stringify({
    type: "object", properties: { title: { $ref: "#/$defs/name" } }, $defs: { name: { type: "string" } },
  }));
  const errors: Buffer[] = [];
  const { held: json } = realBoundary(second.root, second.home, [], errors);
  await expect(semanticCheck([ "review/main", "the request"], json)).resolves.toBe(0);
  expect(Buffer.concat(errors).toString()).toBe("");
});
