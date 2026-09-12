# Corpus expectations are thin for a reader

The conformance corpus is written for a test harness, and it serves that harness well. Read by a person — through [the two site explorers](../planning/notes/2026-09-11-conformance-explorers.md), or in a terminal — three facts are missing that the runtime already knows at the moment it produces the line.

None of these change what the corpus asserts. A harness that compares `{code, path}` sets and byte-exact accept lines keeps comparing exactly those. Each is an additive field or an additive file.

## A refusal names a file, never a span

`expected.jsonl` for a refuse case holds `{"code", "path"}`. The path names the file or the folder at fault. A reader looking at `refuse/frontmatter-invalid-duplicate/` sees the whole file highlighted and has to find the duplicate key themselves.

Add an optional `span` to the refusal: a line number, or a line and column, or a byte offset and length. The runtime knows it — the YAML parser reports it and the sentinel reader has it. Emit it in `--json` beside `code`, `path`, and `message`, and let the corpus carry it where the runtime produces one.

## A resolved option names a rung, never a source

`bot check --json` writes `{"value": "faux", "from": "assembly"}`. The rung is the word a reader needs first and the corpus is right to assert it. The next question is always which file, and for the `assembly` and `stage` rungs there is exactly one answer.

Add an optional `source` beside `from`: the path, relative to the assembly root, of the document whose frontmatter supplied the value. For `default` and for command-line rungs it is absent. The explorer would turn every `from assembly` badge into a click that opens `ASSEMBLY.md`, which is the whole lesson of the rung ladder in one gesture.

## A case has a slug, never a title

A case is a directory name: `intelligence-literal-wins`, `key-missing-profile-bundle`, `tail-container`. A picker with 143 of them is a list of slugs. Someone who knows the format can read them; the reader the explorers exist for cannot.

Add one optional line per case — a `title` file beside `invocation`, or a first comment line in `expected.jsonl` — saying in a sentence what the case proves. "A literal value on the stage beats the same key on the assembly." The corpus already knows this; it lives only in the directory name and in whoever wrote it.

## Order

The title is the cheapest and helps the most; it is a file per case and no runtime change. The option source is next and is one field in the check writer. The refusal span is the largest and the least urgent, because the file at fault is usually small enough to read whole.
