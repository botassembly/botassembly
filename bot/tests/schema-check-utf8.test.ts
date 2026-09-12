// The UTF-8 boundaries, in one file: ticket 0088 (the stage OUTPUT, below),
// ticket 0092 (the schema FILE at check time, and the document read that must
// stay lossy) and ticket 0097 (the markdown output's FRONTMATTER, last).
//
// Ticket 0088 — a stage output that is not valid UTF-8 used to pass its schema.
//
// `Buffer.prototype.toString("utf8")` SUBSTITUTES U+FFFD for every byte it
// cannot decode; it never fails. So `schema-check.ts` handed `JSON.parse` a
// document that was not the document on disk, ajv validated that substitute,
// and the stage passed: `{"x":"\xff"}` against schema `{}` returned
// `passed: true` with an empty message. The bytes that were checked were not
// the bytes that were written, and the retained source was not JSON at all —
// RFC 8259 requires UTF-8, which is why this needs no format ruling
// (specification/elements/schema.md:23 already says an output that does not
// parse sends the agent back).
//
// The fix is a fatal decoder in the same expression, throwing into the same
// allowlisted catch that already converts `JSON.parse` throws to outcomes.
//
// The second half of this file is the falsification that matters, and the
// reason the fix must be at the DECODER rather than in the decoded string:
// legitimate output must still pass. Accented text, CJK and an emoji are the
// easy cases. A lone U+FFFD that the stage legitimately WROTE, as valid UTF-8
// (ef bf bd), is the hard one — after a replacing decode it is byte-identical
// to the corruption, so any fix that searches the decoded string for the
// replacement character refuses a legitimate output forever. Only the decoder
// can tell the two apart, and these two tests fail in opposite directions if
// it stops being the thing that decides.
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { rm } from "node:fs/promises";
import { checkSchema } from "../src/schema-check.ts";
import { readMarkdown, validateJsonSchema } from "../src/documents.ts";
import type { Refusal } from "../src/spine.ts";

const held: string[] = [];
afterEach(async () => {
  await Promise.all(held.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** A schema file on disk, because `checkSchema` reads its schema rather than being handed one. */
async function schemaFile(contents: Buffer | string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "schema-utf8-"));
  held.push(root);
  const path = join(root, "schema.json");
  await writeFile(path, contents);
  return path;
}

/** The ticket's reproduction, byte for byte: `{"x":"\xff"}` — hex 7b2278223a22ff227d. */
const REPRODUCTION = Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]);

test("the ticket's reproduction: a bare 0xff in a stage output no longer passes an empty schema", async () => {
  const result = await checkSchema({ kind: "json", path: await schemaFile("{}\n") }, REPRODUCTION);
  expect(result.passed).toBe(false);
  // The message must name the BYTES, not a syntax error: a reader who is told
  // "Unexpected token" for an encoding problem looks in the wrong place.
  expect(result.message.toString("utf8")).toBe("Invalid JSON: The encoded data was not valid for encoding utf-8\n");
});

// Every family of invalid UTF-8 that a replacing decode silently absorbs. Each
// one is a document that is not JSON; each used to validate as one.
test.for([
  ["a bare 0xff", [0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]],
  ["a truncated three-byte sequence", [0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xe4, 0xb8, 0x22, 0x7d]],
  ["a surrogate encoded as UTF-8 (CESU-8)", [0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xed, 0xa0, 0x80, 0x22, 0x7d]],
  ["an overlong encoding of '/'", [0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc0, 0xaf, 0x22, 0x7d]],
] as [string, number[]][])("a stage output carrying %s is refused", async ([, bytes]) => {
  const result = await checkSchema({ kind: "json", path: await schemaFile("{}\n") }, Buffer.from(bytes));
  expect(result.passed).toBe(false);
  expect(result.message.toString("utf8")).toContain("not valid for encoding utf-8");
});

// The falsification. `{"type":"object"}` is a real schema rather than `{}`, so
// these prove the output reached ajv and validated, not merely that nothing
// threw on the way.
test.for([
  ["plain ASCII", "a"],
  ["accented Latin", "café résumé naïve"],
  ["CJK", "日本語のテキスト"],
  ["an emoji with a modifier", "🙂👍🏽"],
  // Written as valid UTF-8 (ef bf bd) by the stage itself. Indistinguishable
  // from the corruption AFTER a replacing decode; distinguishable only at the
  // decoder, which is the whole reason the fix lives there.
  ["a legitimately written U+FFFD", "�"],
  ["a legitimate U+FFFD amid other text", "before � after"],
] as [string, string][])("legitimate UTF-8 output still passes: %s", async ([, text]) => {
  const output = Buffer.from(JSON.stringify({ x: text }), "utf8");
  const result = await checkSchema({ kind: "json", path: await schemaFile('{"type":"object"}\n') }, output);
  expect(result.passed).toBe(true);
  expect(result.message.toString("utf8")).toBe("");
});

test("the legitimate U+FFFD is carried through to the validator, not merely tolerated", async () => {
  // A `const` schema is the sharpest witness available: it passes only if ajv
  // saw exactly U+FFFD. If a fix ever strips or rejects the character, this
  // fails rather than silently passing something else.
  const schema = await schemaFile(JSON.stringify({ type: "object", properties: { x: { const: "�" } }, required: ["x"] }));
  const result = await checkSchema({ kind: "json", path: schema }, Buffer.from(JSON.stringify({ x: "�" }), "utf8"));
  expect(result.passed).toBe(true);
});

// The schema-file leg, decided by ticket 0088 rather than left to chance: the
// same `jsonValue` reads the schema, so a schema file that is not valid UTF-8
// now takes the SAME throw that a schema which stopped parsing has always
// taken. This is a crash, not a send-back, and deliberately so — the output is
// the model's to get wrong, but the schema was validated before the run and a
// validated schema that is not JSON is a broken invariant, not feedback.
//
// The gap 0088 reported here is closed by ticket 0092 below: `bot check` now
// refuses this file, so this throw is no longer reachable from a green check.
// The test stays because the crash is still the right behavior for a schema
// that changed on disk after it was validated.
test("a schema file that is not valid UTF-8 crashes rather than being silently misread", async () => {
  const path = await schemaFile(Buffer.from([0x7b, 0x22, 0x74, 0x69, 0x74, 0x6c, 0x65, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]));
  await expect(checkSchema({ kind: "json", path }, Buffer.from('{"x":1}', "utf8"))).rejects.toThrow(
    `Validated JSON schema no longer parses: ${path}`,
  );
});

// ------------------------------------------------------------- ticket 0092 --
//
// The check-time half, and the debt 0088 took on. `documents.ts` validated the
// schema FILE with the replacing `readFileSync(filename, "utf8")`, so `bot
// check` exited 0 on a latin-1 `schema.json` and the run then hit the throw
// above — a bare `TypeError`, which under 0082's recognition rule is a
// programmer error, so the run read `crashed`. Ordinary bad input reported as
// the word a SIGKILL earns. The fix is the same fatal decoder in the same one
// expression, throwing into the `catch` `validateJsonSchema` already had.
//
// The invariant these tests pin is the AGREEMENT of the two seams: there must
// be no schema file that check time accepts and run time throws on for
// encoding reasons. Each test below asserts both seams on one file, so the
// pair fails if either seam drifts from the other.
function schemaFaults(filename: string): Refusal[] {
  const faults: Refusal[] = [];
  validateJsonSchema(filename, "flows/change/01-work/schema.json", faults);
  return faults;
}

/** The driver's reproduction: a valid 2020-12 schema whose only fault is latin-1 `café`. */
const LATIN1_SCHEMA = Buffer.concat([
  Buffer.from('{"type":"object","properties":{"note":{"const":"caf', "utf8"),
  Buffer.from([0xe9]),
  Buffer.from('"}}}\n', "utf8"),
]);

test("0092: a mis-encoded schema file is refused at check time, so the run-time throw is unreachable", async () => {
  const path = await schemaFile(LATIN1_SCHEMA);
  // Red before the fix: this array was empty and `bot check` exited 0.
  expect(schemaFaults(path).map((f) => f.code)).toEqual(["schema-invalid"]);
  // The other half of the agreement: this is the file run time would have
  // thrown on, which is why refusing it at check time is the whole ticket.
  await expect(checkSchema({ kind: "json", path }, Buffer.from('{"note":"x"}', "utf8"))).rejects.toThrow(TypeError);
});

test.for([
  ["plain ASCII", "plain"],
  ["accented Latin", "café résumé naïve"],
  ["CJK", "日本語のテキスト"],
  ["an emoji with a modifier", "🙂👍🏽"],
  // The one a careless fix breaks: written by the author as valid UTF-8
  // (ef bf bd), byte-identical to the corruption only AFTER a replacing decode.
  // Any fix that searches the decoded string for U+FFFD refuses this forever.
  ["a legitimately written U+FFFD", "�"],
  ["a legitimate U+FFFD amid other text", "before � after"],
] as [string, string][])("0092: a legitimate schema file is still accepted at check time: %s", async ([, text]) => {
  const schema = JSON.stringify({ type: "object", properties: { note: { const: text } }, required: ["note"] });
  const path = await schemaFile(Buffer.from(`${schema}\n`, "utf8"));
  expect(schemaFaults(path)).toEqual([]);
  // Not merely unrefused: the exact characters reached ajv, witnessed by a
  // `const` that only matches if no byte was substituted on either read.
  const passing = await checkSchema({ kind: "json", path }, Buffer.from(JSON.stringify({ note: text }), "utf8"));
  expect(passing.passed).toBe(true);
  const failing = await checkSchema({ kind: "json", path }, Buffer.from(JSON.stringify({ note: `${text} ` }), "utf8"));
  expect(failing.passed).toBe(false);
});

// The OTHER half of 0092's question, and the reason the fix above is confined
// to the schema file: `documents.ts:54` reads every authored document with the
// same replacing `readFileSync(filename, "utf8")`, and for documents that is
// not a defect but the specified behavior. `stage.md:68` rules it in so many
// words — "A body is decoded as UTF-8, and bytes that are not UTF-8 become
// replacement characters — deliberately: the body is prompt text, the assembly
// can honestly run, and the author's garbage reaches the agent visibly rather
// than refusing a runnable assembly."
//
// So the asymmetry is deliberate, not an oversight: JSON is UTF-8 by RFC 8259
// and a mis-encoded schema is not a schema, while a mis-encoded prompt is still
// a prompt. This test exists because that sentence had no witness — a later
// builder "completing" 0092 by making `:54` fatal too would refuse assemblies
// the specification requires a runtime to run, and nothing would have caught it.
test("0092: a stage body that is not valid UTF-8 is NOT refused — stage.md:68 requires the replacing read", async () => {
  const root = await mkdtemp(join(tmpdir(), "schema-utf8-body-"));
  held.push(root);
  const filename = join(root, "STAGE.md");
  // The same latin-1 0xe9 the schema case above is refused for, in a prompt body.
  await writeFile(filename, Buffer.concat([
    Buffer.from("---\n---\n\nWrite about a caf", "utf8"),
    Buffer.from([0xe9]),
    Buffer.from(".\n", "utf8"),
  ]));
  const faults: Refusal[] = [];
  const document = readMarkdown(filename, "flows/change/01-work/STAGE.md", faults);
  expect(faults).toEqual([]);
  expect(document.sound).toBe(true);
  // Visibly, in the agent's prompt — the sentence's word — rather than refused.
  expect(document.body).toContain("caf�");
});

// ------------------------------------------------------------- ticket 0097 --
//
// The markdown half, which 0092 stopped at rather than guessing: `checkMarkdown`
// decoded the whole output with the replacing `output.toString("utf8")`, so a
// bare `0xff` returned `passed: true` wherever it sat.
//
// Ian ruled FRONTMATTER ONLY, and the ruling has two halves that must both be
// witnessed, because a fix that satisfies the first and breaks the second has
// built the whole-file rule he rejected:
//
//   - The frontmatter "is data and is validated" (schema.md), so a byte that
//     becomes U+FFFD there defeats the very check meant to catch it — a
//     mis-encoded value passes a `str` slim-type check as a substitute string.
//   - The BODY is prose and is not validated. `stage.md:68` already rules that
//     a prompt body's non-UTF-8 bytes become replacement characters
//     deliberately, and a stage with no schema writes whatever the agent
//     produced (`stage.md:120`). An output body is the mirror of that.
//
// The split therefore has to happen on BYTES. A lossy decode substitutes U+FFFD
// before anything can look at it, so decode-split-re-encode cannot tell a
// corrupted byte from a legitimately written U+FFFD — the last case below is
// exactly that document, and it must still pass in both halves of the file.

/** A `schema.md` template on disk, beside the `schema.json` helper above. */
async function markdownSchemaFile(contents: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "schema-utf8-md-"));
  held.push(root);
  const path = join(root, "schema.md");
  await writeFile(path, contents);
  return path;
}

const TEMPLATE = "---\nverdict: str\n---\n\n## What changed\n";

/** `---\nverdict: <value>\n---\n\n<body>\n`, assembled from bytes so a test can
 *  place an invalid byte on either side of the closing fence exactly. */
function output(value: Buffer | string, body: Buffer | string): Buffer {
  return Buffer.concat([
    Buffer.from("---\nverdict: ", "utf8"), Buffer.from(value), Buffer.from("\n---\n\n", "utf8"),
    Buffer.from(body), Buffer.from("\n", "utf8"),
  ]);
}

const BAD = Buffer.from([0xff]);

test("0097: the reproduction — a bare 0xff in the FRONTMATTER no longer passes", async () => {
  const path = await markdownSchemaFile(TEMPLATE);
  // Red before the fix: `passed` was true and `message` was empty. `0xff`
  // decoded to U+FFFD, which is a string, which is what `str` asks for.
  const result = await checkSchema({ kind: "markdown", path }, output(BAD, "Some prose."));
  expect(result.passed).toBe(false);
  // The message must name the BYTES. A byte problem reported as a shape problem
  // ("verdict is not str") sends the reader to the wrong half of the document.
  expect(result.message.toString("utf8")).toBe("Markdown frontmatter is not valid UTF-8.\n");
});

// The falsification that matters: the SAME byte, on the other side of the
// closing fence, still passes. This is the entire difference between the rule
// Ian chose and the whole-file rule he rejected, and it is the test that fails
// the day someone "completes" this ticket.
test("0097: the same 0xff in the BODY still passes — the body is prose, not data", async () => {
  const path = await markdownSchemaFile(TEMPLATE);
  const result = await checkSchema({ kind: "markdown", path }, output("ok", Buffer.concat([Buffer.from("caf"), BAD, Buffer.from(".")])));
  expect(result.passed).toBe(true);
  expect(result.message.toString("utf8")).toBe("");
});

test.for([
  ["a truncated three-byte sequence", [0xe4, 0xb8]],
  ["a surrogate encoded as UTF-8 (CESU-8)", [0xed, 0xa0, 0x80]],
  ["an overlong encoding of '/'", [0xc0, 0xaf]],
  ["a lone continuation byte", [0x80]],
] as [string, number[]][])("0097: frontmatter carrying %s is refused, the same bytes in the body are not", async ([, bytes]) => {
  const path = await markdownSchemaFile(TEMPLATE);
  const inFrontmatter = await checkSchema({ kind: "markdown", path }, output(Buffer.from(bytes), "prose"));
  expect(inFrontmatter.passed).toBe(false);
  expect(inFrontmatter.message.toString("utf8")).toBe("Markdown frontmatter is not valid UTF-8.\n");
  const inBody = await checkSchema({ kind: "markdown", path }, output("ok", Buffer.from(bytes)));
  expect(inBody.passed).toBe(true);
});

// The other falsification: legitimate UTF-8 must still pass in BOTH halves. The
// key carries the text as well as the value, which makes this the markdown
// equivalent of the `const` witness used above — a substituted byte on either
// read renames the key, and the check then fails "missing" rather than passing
// something that merely looks close enough.
test.for([
  ["plain ASCII", "plain"],
  ["accented Latin", "café résumé naïve"],
  ["CJK", "日本語のテキスト"],
  ["an emoji with a modifier", "🙂👍🏽"],
  // Written by the stage as valid UTF-8 (ef bf bd). After a replacing decode it
  // is byte-identical to the corruption above, so any fix that searches the
  // decoded string for U+FFFD refuses this document forever.
  ["a legitimately written U+FFFD", "�"],
  ["a legitimate U+FFFD amid other text", "before � after"],
] as [string, string][])("0097: legitimate UTF-8 in frontmatter AND body still passes: %s", async ([, text]) => {
  const path = await markdownSchemaFile(`---\n"${text}": str\n---\n\n## Body\n`);
  const document = Buffer.from(`---\n"${text}": "${text}"\n---\n\n${text}\n`, "utf8");
  const result = await checkSchema({ kind: "markdown", path }, document);
  expect(result.passed).toBe(true);
  expect(result.message.toString("utf8")).toBe("");
  // Not merely unrefused: the key round-tripped. Rename it by one character and
  // the check fails, which is what proves the passing case compared real bytes.
  const renamed = Buffer.from(`---\n"${text}x": "${text}"\n---\n\n${text}\n`, "utf8");
  expect((await checkSchema({ kind: "markdown", path }, renamed)).passed).toBe(false);
});

// The shape refusals must keep their own messages: a document with no fence, or
// an unclosed one, has no frontmatter to judge the bytes of, and reporting those
// as an encoding problem would be the same wrong-place mistake in reverse.
test.for([
  ["no frontmatter at all", "Just prose.\n", "Markdown output has no frontmatter.\n"],
  ["an unclosed fence", "---\nverdict: ok\n\nprose\n", "Markdown output has unclosed frontmatter.\n"],
] as [string, string, string][])("0097: %s still reports its own shape failure", async ([, text, message]) => {
  const path = await markdownSchemaFile(TEMPLATE);
  const bad = Buffer.concat([Buffer.from(text, "utf8"), BAD]);
  const result = await checkSchema({ kind: "markdown", path }, bad);
  expect(result.passed).toBe(false);
  expect(result.message.toString("utf8")).toBe(message);
});

// CRLF, because the byte-level split has to find the same closing fence the
// decoded line-split finds, on either line ending. The bad byte sits in the
// body: if the split ran long, this would be refused.
test("0097: a CRLF document splits at the same fence — a bad byte in its body passes", async () => {
  const path = await markdownSchemaFile(TEMPLATE);
  const document = Buffer.concat([Buffer.from("---\r\nverdict: ok\r\n---\r\n\r\ncaf", "utf8"), BAD, Buffer.from("\r\n", "utf8")]);
  expect((await checkSchema({ kind: "markdown", path }, document)).passed).toBe(true);
  const corrupt = Buffer.concat([Buffer.from("---\r\nverdict: ", "utf8"), BAD, Buffer.from("\r\n---\r\n\r\nprose\r\n", "utf8")]);
  expect((await checkSchema({ kind: "markdown", path }, corrupt)).passed).toBe(false);
});
