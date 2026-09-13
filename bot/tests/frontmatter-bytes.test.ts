// Ticket 0122, C30 — Ian's ruling of 2026-08-05: strict config, tolerant prose.
// A bad byte anywhere in a document's frontmatter refuses; the same bad byte in
// the prose body is accepted, because a body is text for an agent to read and
// frontmatter is configuration bot acts on. The home `config.yaml` is on the
// strict side whole: every byte of it is configuration and none of it is prose.
//
// What it was before: `readFileSync(filename, "utf8")` substitutes U+FFFD and
// says nothing, so `model: gpt<FF>4` reached the provider as `gpt�4` and a
// Markdown schema template demanded a key no agent could ever spell. Both were
// silent — no fault, no diagnostic, exit 0 from `bot check`.
//
// Nothing here reaches a model or the real ~/.pi, ~/.cache or ~/.local/share.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { readMarkdown } from "../src/documents.ts";
import { check } from "../src/reader.ts";
import type { Refusal } from "../src/spine.ts";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** One byte no UTF-8 sequence may contain, in the middle of otherwise ASCII text. */
function torn(before: string, after: string): Buffer {
  return Buffer.concat([Buffer.from(before), Buffer.from([0xff]), Buffer.from(after)]);
}

/** A sound assembly whose one stage is a folder, so a `schema.md` template fits
 *  beside its `STAGE.md`. `assembly` and `template` are written as given. */
async function assemblyWith(assembly: Buffer | string, template: Buffer | string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "bot-frontmatter-bytes-"));
  dirs.push(dir);
  const stage = join(dir, "asm/flows/main/01-do");
  await mkdir(stage, { recursive: true });
  await writeFile(join(dir, "asm/ASSEMBLY.md"), assembly);
  await mkdir(join(dir, "home"), { recursive: true });
  await writeFile(join(dir, "home/config.yaml"), "intelligences:\n  default: { provider: p, model: m, reasoning: medium }\n  m�m: { provider: p, model: m�m, reasoning: medium }\n");
  await writeFile(join(dir, "asm/flows/main/FLOW.md"), "---\ndescription: d\n---\n");
  await writeFile(join(stage, "STAGE.md"), "---\n---\nDo.\n");
  await writeFile(join(stage, "schema.md"), template);
  return dir;
}

const SOUND_ASSEMBLY = "---\nintelligence: default\n---\nRoute.\n";
const SOUND_TEMPLATE = "---\ntitle: str\n---\n";

test("the same assembly with clean bytes checks, so the refusals below are the byte and nothing else", async () => {
  const held = check("./asm/main --home ./home", await assemblyWith(SOUND_ASSEMBLY, SOUND_TEMPLATE), process.env);
  expect([held.exitCode, held.lines.filter((line) => line.includes("frontmatter-invalid"))]).toEqual([0, []]);
});

test("a bad byte in a frontmatter VALUE is refused, not decoded to a replacement character", async () => {
  const dir = await assemblyWith(torn("---\nprovider: p\nmodel: gpt", "4\n---\nRoute.\n"), SOUND_TEMPLATE);
  const held = check("./asm/main --home ./home", dir, process.env);
  expect(held.exitCode).toBe(2);
  expect(held.lines).toContain('{"code":"frontmatter-invalid","path":"ASSEMBLY.md","message":"Make the frontmatter valid UTF-8."}');
  // And no line anywhere carries the character the old decode invented.
  expect(held.lines.join("\n")).not.toContain("�");
});

test("a bad byte in a schema TEMPLATE's frontmatter key is refused — the ruling says schema templates too", async () => {
  const dir = await assemblyWith(SOUND_ASSEMBLY, torn("---\ntit", "le: str\n---\n"));
  const held = check("./asm/main --home ./home", dir, process.env);
  expect(held.exitCode).toBe(2);
  expect(held.lines).toContain('{"code":"frontmatter-invalid","path":"flows/main/01-do/schema.md","message":"Make the frontmatter valid UTF-8."}');
  expect(held.lines.join("\n")).not.toContain("�");
});

test("a bad byte in the prose BODY is accepted, and the body keeps a replacement character where it was", async () => {
  const dir = await assemblyWith(SOUND_ASSEMBLY, SOUND_TEMPLATE);
  await writeFile(join(dir, "asm/flows/main/01-do/STAGE.md"), torn("---\n---\nDo ", " it.\n"));
  const held = check("./asm/main --home ./home", dir, process.env);
  expect([held.exitCode, held.lines.filter((line) => line.includes("frontmatter-invalid"))]).toEqual([0, []]);
  const faults: Refusal[] = [];
  const document = readMarkdown(join(dir, "asm/flows/main/01-do/STAGE.md"), "flows/main/01-do/STAGE.md", faults);
  expect([faults, document.sound, document.body]).toEqual([[], true, "Do � it.\n"]);
});

// A genuine U+FFFD an author typed is three valid UTF-8 bytes, so the round trip
// leaves it alone: the rule is about bytes that are not UTF-8, never about a
// character. Detecting the character instead would refuse this document.
test("a real replacement character in frontmatter is not a bad byte, and is accepted", async () => {
  const dir = await assemblyWith("---\nintelligence: m�m\n---\nRoute.\n", SOUND_TEMPLATE);
  const held = check("./asm/main --home ./home", dir, process.env);
  expect([held.exitCode, held.lines.filter((line) => line.includes("frontmatter-invalid"))]).toEqual([0, []]);
});

// The home `config.yaml` has no fences and no body — it is configuration end to
// end — so the round trip covers the whole file rather than a region of it.
async function homeWith(config: Buffer | string): Promise<string> {
  const dir = await assemblyWith(SOUND_ASSEMBLY, SOUND_TEMPLATE);
  await mkdir(join(dir, "home"), { recursive: true });
  await writeFile(join(dir, "home/config.yaml"), config);
  return dir;
}

test("a clean home config still resolves, so the refusal below is the byte and nothing else", async () => {
  const held = check("./asm/main --home ./home", await homeWith("intelligences:\n  default: { model: faux-1, reasoning: medium }\n"), process.env);
  expect([held.exitCode, held.lines.filter((line) => line.includes("frontmatter-invalid"))]).toEqual([0, []]);
});

// The byte goes in a free-form value on purpose. A closed-set key like
// `reasoning` already refused, as `value-invalid` naming the wrong cause; a
// string key is where the old decode was SILENT, and silence is the defect.
test("a bad byte in the home config is refused — the whole file is configuration", async () => {
  const held = check("./asm/main --home ./home", await homeWith(torn("model: exampl", "e-model\n")), process.env);
  expect(held.exitCode).toBe(2);
  expect(held.lines).toContain('{"code":"frontmatter-invalid","path":"home/config.yaml","message":"Make the home YAML valid UTF-8."}');
  expect(held.lines.join("\n")).not.toContain("�");
});
