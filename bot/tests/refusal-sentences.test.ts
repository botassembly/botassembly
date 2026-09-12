// Ticket 0128 — a refusal says what to type. The sibling the playtest praised,
// "Make the file executable with a shebang or binary format", names the fix;
// these named the rule instead ("Add the required sentinel"), or named a fix
// that was not the one ("Supply a value for --verbose", for an option that does
// not exist), or named half of one ("Name a source git can clone", to someone
// who gave a path).
//
// What is pinned here is the SENTENCE, which refusals.md leaves to a runtime
// and the corpus never asserts — so these are the only witnesses these words
// have, and rewording one deliberately reds exactly one line here.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { main, type CliBoundary } from "../src/cli.ts";
import { semanticCheck } from "./semantic-check.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** A home holding one assembly named `review`, built file by file: every test
 *  below differs from the sound tree by exactly the one thing it refuses on. */
async function home(prefix: string, files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  const assembly = join(root, "home", "assemblies", "review");
  const held: Record<string, string> = {
    "ASSEMBLY.md": "---\nintelligence: default\nslots:\n  notes: some notes\n---\nReview things.\n",
    "flows/main/FLOW.md": "---\ndescription: main flow\n---\n",
    "flows/main/01-work.md": "---\n---\nDo the work.\n",
    ...files,
  };
  for (const [name, text] of Object.entries(held)) {
    if (text.length === 0) continue;
    await mkdir(join(assembly, name, ".."), { recursive: true });
    await writeFile(join(assembly, name), text);
  }
  return join(root, "home");
}

/** The `{code, path, message}` objects one invocation wrote, as JSON. */
async function refusals(argv: string[], where: string): Promise<Record<string, string>[]> {
  const errors: Buffer[] = [];
  const semantic = argv.slice(2);
  const code = await semanticCheck([...semantic, "--json"], {
    cwd: process.cwd(), env: { BOT_HOME: where }, stdinIsTTY: true, stderrIsTTY: false,
    readStdin: () => Promise.resolve(Buffer.alloc(0)), stdout: () => undefined, stderr: (text) => { errors.push(Buffer.from(text)); },
    clock: { milliseconds: () => 0, timestamp: () => "2026-08-02T00:00:00.000Z",
      setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
      clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); } },
  });
  expect(code).toBe(2);
  return Buffer.concat(errors).toString().split("\n").filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, string>);
}

/** Semantic refusals after a current command adapter has accepted the request. */
async function adapterRefusals(argv: string[], where: string): Promise<Record<string, string>[]> {
  const errors: Buffer[] = [];
  const boundary: CliBoundary = {
    cwd: process.cwd(), env: { BOT_HOME: where }, stdinIsTTY: true, stderrIsTTY: false,
    readStdin: () => Promise.resolve(Buffer.alloc(0)), stdout: () => undefined, stderr: (text) => { errors.push(Buffer.from(text)); },
    clock: { milliseconds: () => 0, timestamp: () => "2026-08-02T00:00:00.000Z",
      setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
      clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); } },
  };
  const code = await main([...argv, "--json"], boundary);
  expect(code).toBe(2);
  const document = JSON.parse(Buffer.concat(errors).toString()) as {
    error: { details: { faults?: Array<{ code: string; path: string; sentence: string }>; refusals?: Array<{ code: string; path: string; message: string }> } };
  };
  const faults = (document.error.details.faults ?? [])
    .map(({ code: faultCode, path, sentence }) => ({ code: faultCode, path, message: sentence }));
  return faults.length > 0 ? faults : (document.error.details.refusals ?? []);
}

// ─── 1. sentinels name the file to add, or the ones that stand here ──────────

test("sentinel-missing names the files this position takes, in a flow and in a sequence entry alike", async () => {
  const stage = await home("bot-0128-sentinel-stage-", { "flows/main/01-work.md": "", "flows/main/01-work/notes.txt": "no sentinel here\n" });
  expect(await refusals(["assembly", "check", "review/main"], stage)).toContainEqual({
    code: "sentinel-missing",
    path: "flows/main/01-work",
    message: "Add STAGE.md, LOOP.md, CHOOSE.md, PARALLEL.md or FANOUT.md to this folder.",
  });
  const flow = await home("bot-0128-sentinel-flow-", { "flows/main/FLOW.md": "" });
  expect(await refusals(["assembly", "check", "review/main"], flow)).toContainEqual({
    code: "sentinel-missing",
    path: "flows/main",
    message: "Add FLOW.md or DESCEND.md to this folder.",
  });
});

test("sentinel-unknown names the sentinels that do stand here, and says which file to rename", async () => {
  const misplaced = await home("bot-0128-sentinel-position-", { "flows/main/01-work.md": "", "flows/main/01-work/FLOW.md": "---\ndescription: nope\n---\n" });
  expect(await refusals(["assembly", "check", "review/main"], misplaced)).toContainEqual({
    code: "sentinel-unknown",
    path: "flows/main/01-work/FLOW.md",
    message: "Use STAGE.md, LOOP.md, CHOOSE.md, PARALLEL.md or FANOUT.md here.",
  });
  const strange = await home("bot-0128-sentinel-caps-", { "flows/main/01-work.md": "", "flows/main/01-work/STAGE.md": "---\n---\nDo.\n", "flows/main/01-work/BANANA.md": "not a sentinel\n" });
  expect(await refusals(["assembly", "check", "review/main"], strange)).toContainEqual({
    code: "sentinel-unknown",
    path: "flows/main/01-work/BANANA.md",
    message: "Rename BANANA.md, or make it STAGE.md, LOOP.md, CHOOSE.md, PARALLEL.md or FANOUT.md.",
  });
});

// assembly.md: an assembly holds no other. The old sentence sent a reader
// looking for the sentinel valid in this position, and there is none — no
// spelling of ASSEMBLY.md stands anywhere inside an assembly.
test("a nested ASSEMBLY.md says the rule it broke instead of asking for a valid sentinel", async () => {
  const nested = await home("bot-0128-nested-assembly-", {
    "subflows/child/ASSEMBLY.md": "---\nintelligence: default\n---\nChild.\n",
    "subflows/child/flows/inner/FLOW.md": "---\ndescription: inner\n---\n",
    "subflows/child/flows/inner/01-work.md": "---\n---\nWork.\n",
  });
  expect(await refusals(["assembly", "check", "review/main"], nested)).toContainEqual({
    code: "sentinel-unknown",
    path: "subflows/child/ASSEMBLY.md",
    message: "Remove ASSEMBLY.md; an assembly holds no assembly inside it.",
  });
});

// ─── 2. an option is judged as a key before it is judged as valueless ────────

test("an unknown option with no value is unknown, not valueless", async () => {
  const where = await home("bot-0128-unknown-option-", {});
  expect(await refusals(["assembly", "check", "review/main", "--verbose"], where)).toContainEqual({
    code: "key-unknown",
    path: "--verbose",
    message: "Remove the unknown option --verbose.",
  });
  // The same key with a value said this already, and still does.
  expect(await refusals(["assembly", "check", "review/main", "--verbose", "true"], where)).toContainEqual({
    code: "key-unknown",
    path: "--verbose",
    message: "Remove the unknown option --verbose.",
  });
});

test("an option bot does have, given no value, still asks for the value — options and slots alike", async () => {
  const where = await home("bot-0128-valueless-option-", {});
  expect(await refusals(["assembly", "check", "review/main", "--intelligence"], where)).toContainEqual({
    code: "request-invalid",
    path: "--intelligence",
    message: "Supply a value for --intelligence.",
  });
  expect(await refusals(["assembly", "check", "review/main", "--notes"], where)).toContainEqual({
    code: "request-invalid",
    path: "--notes",
    message: "Supply a value for --notes.",
  });
  expect(await refusals(["assembly", "check", "review/main", "--home"], where)).toContainEqual({
    code: "request-invalid",
    path: "--home",
    message: "Supply a value for --home.",
  });
});

// ─── 3. a missing @task file is that file's fault, on both command paths ─────

// refusals.md gives a missing `@task` file to `path-missing`, "a path the
// invocation named does not exist", and the corpus pins it (refuse/
// path-missing-task). The two current command adapters must preserve the same
// semantic refusal.
test("run start refuses a missing @task file the way assembly check does, and the way the corpus pins", async () => {
  const where = await home("bot-0128-task-file-", {});
  const expected = { code: "path-missing", path: "absent.md", message: "Create the requested task file." };
  expect(await adapterRefusals(["assembly", "check", "review/main", "@absent.md"], where)).toContainEqual(expected);
  expect(await adapterRefusals(["run", "start", "review/main", "@absent.md"], where)).toContainEqual(expected);
});

// ─── 5. a duplicate number names its partner ─────────────────────────────────

test("number-duplicate names both files, so the partner need not be hunted", async () => {
  const where = await home("bot-0128-number-duplicate-", { "flows/main/01-other.md": "---\n---\nOther.\n" });
  expect(await refusals(["assembly", "check", "review/main"], where)).toContainEqual({
    code: "number-duplicate",
    path: "flows/main/01-work.md",
    message: "Renumber 01-work.md or 01-other.md — both are numbered 1.",
  });
});

// ─── 6. malformed YAML passes the parser's own position through ──────────────

// "bad: [unclosed" is not a key problem and it is not a duplicate: it is an
// unclosed flow sequence, and the yaml library knows exactly where. The line is
// the FILE's — the frontmatter starts one line below its opening fence.
test("malformed YAML says where, in the file's own lines", async () => {
  const where = await home("bot-0128-yaml-position-", { "flows/main/01-work.md": "---\nbad: [unclosed\n---\n\nDo the work.\n" });
  expect(await refusals(["assembly", "check", "review/main"], where)).toContainEqual({
    code: "frontmatter-invalid",
    path: "flows/main/01-work.md",
    message: "Fix the YAML frontmatter at line 2, column 15.",
  });
});

test("a duplicate key says where too, and the sentence no longer guesses which of the two it was", async () => {
  const where = await home("bot-0128-yaml-duplicate-", { "flows/main/01-work.md": "---\ntimeout: 10\ntimeout: 20\n---\n\nDo the work.\n" });
  expect(await refusals(["assembly", "check", "review/main"], where)).toContainEqual({
    code: "frontmatter-invalid",
    path: "flows/main/01-work.md",
    message: "Fix the YAML frontmatter at line 3, column 1.",
  });
});

// A declared name becomes an uppercased shell variable. The refusal gives the
// author every spelling needed to distinguish or repair the declaration.
test("declared slot refusals name colliding declarations and an invalid character", async () => {
  const collisionHome = await home("bot-slot-name-collision-", {
    "ASSEMBLY.md": "---\nintelligence: default\nslots:\n  notes: first\n  NOTES: second\n---\nReview things.\n",
  });
  const collision = (await refusals(["assembly", "check", "review/main"], collisionHome)).find((fault) => fault.code === "slot-reserved")?.message ?? "";
  expect(collision).toContain("notes");
  expect(collision.replace("notes", "")).toContain("NOTES");

  const invalidHome = await home("bot-slot-name-invalid-", {
    "ASSEMBLY.md": "---\nintelligence: default\nslots:\n  my-slot: invalid\n---\nReview things.\n",
  });
  const invalid = (await refusals(["assembly", "check", "review/main"], invalidHome)).find((fault) => fault.code === "slot-reserved")?.message ?? "";
  expect(invalid).toContain("my-slot");
  expect(invalid.replace("my-slot", "")).toContain("-");
});

// The home's config.yaml has no fence, so its lines are its own — offset zero,
// and the position is still the library's and not ours: an unclosed sequence
// that runs to the end of the file is reported AT the end of the file (line 3,
// column 1 of two lines and a terminator), which is where yaml says it gave up.
// A runtime inventing a friendlier number would be inventing a fact.
test("the home's own YAML says where as well, at the position the parser gives", async () => {
  const where = await home("bot-0128-yaml-home-", {});
  await writeFile(join(where, "config.yaml"), "retries: 1\nbad: [unclosed\n");
  const held = (await refusals(["assembly", "check", "review/main"], where)).find((one) => one.code === "frontmatter-invalid");
  expect(held?.path?.endsWith("/home/config.yaml")).toBe(true);
  expect(held?.message).toBe("Fix the home YAML at line 3, column 1.");
});
