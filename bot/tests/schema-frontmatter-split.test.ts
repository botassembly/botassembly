// Ticket 0097 — the byte-level split, proved exact rather than asserted.
//
// `schema-check.ts` decides where a markdown output's frontmatter ends by
// scanning a `latin1` view of the bytes, because the utf8 view it used to scan
// substitutes U+FFFD and destroys the evidence before anything can judge it.
// The claim that makes the ruling work is that the byte scan finds the SAME
// closing fence the decoded line split finds — no more and no less:
//
//   - one byte SHORT and a corrupt byte in real frontmatter passes, which is
//     the defect this ticket exists to close;
//   - one byte LONG and a corrupt byte in the body is refused, which is the
//     whole-file rule Ian explicitly rejected.
//
// The named cases in `schema-check-utf8.test.ts` hold the two halves at hand-
// picked offsets. This file holds the boundary itself: an independent oracle,
// written from the decoded `/\r?\n/` semantics rather than from the regex under
// test, and a bad byte walked across every offset of twelve document shapes.
//
// Ticket 0104 added the last four. The eight the oracle was born with are all
// ASCII, where a byte count and a code-unit count are the same number, so the
// oracle could not see the one thing `latin1` is there for. See `SHAPES`.
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { afterEach, expect, test } from "vitest";
import { checkSchema } from "../src/schema-check.ts";

const held: string[] = [];
afterEach(async () => {
  await Promise.all(held.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** Byte offsets of every line's end, and the lines themselves, split the way
 *  `/\r?\n/` splits a decoded string — a lone `\r` is content, not a terminator. */
function lines(buf: Buffer): { text: string[]; ends: number[] } {
  const text: string[] = [];
  const ends: number[] = [];
  let start = 0;
  for (let i = 0; i <= buf.length; i++) {
    if (i !== buf.length && buf[i] !== 0x0a) continue;
    const cr = i > start && buf[i - 1] === 0x0d;
    text.push(buf.subarray(start, cr ? i - 1 : i).toString("latin1"));
    ends.push(Math.min(i + 1, buf.length));
    start = i + 1;
  }
  return { text, ends };
}

/** The byte offset just past the closing fence, or 0 when there is no frontmatter. */
function oracleEnd(buf: Buffer): number {
  const { text, ends } = lines(buf);
  if (text[0] !== "---") return 0;
  const end = text.indexOf("---", 1);
  return end < 0 ? 0 : ends[end] ?? 0;
}

async function template(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "frontmatter-split-"));
  held.push(root);
  const path = join(root, "schema.md");
  await writeFile(path, "---\nverdict: str\n---\n\n## What changed\n");
  return path;
}

const SHAPES = [
  "---\nverdict: ok\n---\n\nsome prose\n",
  "---\r\nverdict: ok\r\n---\r\n\r\nsome prose\r\n",
  // A lone `\r` before a `---`, which is content to the decoded split and must
  // not be read as a line boundary by the byte scan either.
  "---\nverdict: ok\nnote: a\r---\nother: 1\n---\n\nprose\n---\nmore\n",
  "---\nverdict: ok\n---",
  "---\nverdict: ok\n---\n\nbody with --- inside\nand ---- too\n",
  "---\nverdict: ok\n---\n",
  "no frontmatter at all\n",
  "---\nverdict: ok\nunclosed\n",
  // Ticket 0104 — the byte-versus-code-unit identity, which the eight shapes
  // above are all ASCII and so cannot see. `latin1` is byte-for-byte, so
  // `fence.length` is a BYTE count and the slice is exactly the frontmatter; a
  // `utf8` decode counts UTF-16 code units instead and the slice UNDER-RUNS by
  // the byte deficit, leaving the tail of the frontmatter unjudged. Each shape
  // below puts its multi-byte characters ahead of an ASCII tail long enough to
  // hold the deficit, so the under-run ends on a CLEAN character boundary with
  // the bad byte outside it — a document with a raw 0xff in its frontmatter
  // that the wrong implementation calls valid. Truncating mid-sequence hides
  // that bug behind an accidental refusal; these shapes do not let it.
  // Two bytes to one code unit: eight characters, deficit 8.
  "---\nverdict: éééééééé\nnote: abcdefgh\n---\n\nprose\n",
  // Three bytes to one code unit: four characters, deficit 8.
  "---\nverdict: 中中中中\nnote: abcdefgh\n---\n\nprose\n",
  // Four bytes to TWO code units: four characters, deficit 8 again — the same
  // deficit from half the characters. The only shape here that tells a code
  // UNIT count apart from a code POINT count, which for astral pairs differ.
  "---\nverdict: 🙂🙂🙂🙂\nnote: abcdefgh\n---\n\nprose\n",
  // The mirror, and the other direction of the same error: a multi-byte
  // character flush against the closing fence, so a code-unit slice stops
  // mid-sequence, and a multi-byte BODY, whose bytes are never judged (schema.md).
  "---\nverdict: ok🙂🙂🙂🙂\n---\n\ncafé 中文 🙂\n",
];

test("0097: a bad byte is refused at exactly the offsets inside the frontmatter", async () => {
  const path = await template();
  let checked = 0;
  for (const shape of SHAPES) {
    const clean = Buffer.from(shape, "utf8");
    const end = oracleEnd(clean);
    for (let i = 0; i < clean.length; i++) {
      const document = Buffer.from(clean);
      document[i] = 0xff;
      // Overwriting a fence byte moves the fence, and then the oracle is asking
      // about a different document; those offsets are not a boundary claim.
      if (oracleEnd(document) !== end) continue;
      const result = await checkSchema({ kind: "markdown", path }, document);
      const refusedForBytes = result.message.toString("utf8") === "Markdown frontmatter is not valid UTF-8.\n";
      expect(refusedForBytes, `${JSON.stringify(shape)} at byte ${String(i)}`).toBe(i < end);
      checked++;
    }
  }
  // A guard on the guard: a rewrite that stopped generating cases would pass
  // vacuously. 395 offsets across the twelve shapes — the original eight
  // contribute 212 and 0104's four multi-byte shapes 183 — measured 2026-08-04.
  expect(checked).toBe(395);
});
