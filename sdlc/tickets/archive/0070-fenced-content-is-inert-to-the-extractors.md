---
flow: quickfix
priority: 7
---
# Fenced content is inert to the extractors

The body extractors read markdown line by line with no
fenced-code-block tracking, so example code changes what a stage
enforces:

- `sectionLines` (`bot/src/extract.ts:8`) ends a `## Checklist`
  section at any column-0 line matching a heading pattern. A
  flush-left fence containing a shell comment — `# install deps` —
  reads as a heading and silently drops every checklist item after
  it: attempts pass with the dropped items never marked, and no
  fault is raised.
- The alternatives extractor (`bot/src/extract.ts:32`) registers a
  fenced line starting `- ` as a phantom CHOOSE alternative.

Done, observably: content inside a fenced code block never ends a
checklist section, never contributes a checklist item, and never
names a CHOOSE alternative — a stage body whose fence contains
`# anything` or `- anything` extracts exactly the items and
alternatives its prose declares.

This ticket exists because of
`sdlc/issues/0059-a-code-fence-heading-truncates-the-checklist.md`.

Named for restatement in `design:`/`design-review:` commits: none
expected — new cases land beside the existing extract and
checklist tests.
