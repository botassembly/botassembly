---
flow: build
priority: 7
---
# Explain distinguishes managed temporary paths from shell path references

`bot explain` now preserves completed and incomplete stage work, but its path-scope reading has two observable blind spots. A stage's real `$TMP/find.json` can be labeled `outside` when Bot assigned `$TMP` under `/tmp` rather than under the retained stage scratch directory. Conversely, a Bash call such as `find /home/ian/workspace/data/trials8 ...` remains absent from the path reading because the path occurs inside shell arguments rather than a dedicated file-tool target. The first result is a false alarm; the second hides the exact broad discovery an operator is looking for.

Done, observably:

- Every concrete path Bot assigned to `$INPUT`, `$OUTPUT`, `$TMP`, and `$SKILLS` is classified under its managed category even when the directories have different parents. A file beneath the assigned `$TMP` is a slot, not outside access.
- The human and JSON explanations separately report absolute path references found in settled shell-command arguments. They distinguish a command reference from a proven file read or write; the explanation does not claim that parsing shell text proves access.
- A shell reference beneath the assigned input, skills, output, or temporary directory receives that managed classification. A reference outside all assigned stage roots is visibly classified as outside-command-scope.
- Quoted paths, paths followed by punctuation, and more than one path in one command are covered. Ordinary flags, URLs, NCT identifiers, and text that merely contains slashes do not become path claims.
- Stage narrowing and incomplete-stage explanation preserve the same classification behavior.
- Human output remains bounded and plain. JSON remains one newline-terminated, schema-versioned object with additive fields and retains the existing meanings of `receivedInputs`, `skills`, `slots`, and `outside`.

Hard choices, settled: this is read-only observability, not a sandbox or command firewall. Dedicated read/write tool targets remain stronger evidence than shell argument text. Shell paths are labeled as references so an operator can see broad discovery without Bot pretending it observed every syscall.

Boundary: change only `bot explain`, its help, and focused fixtures. Do not change tool execution, shell parsing at runtime, permissions, run recording, transcript storage, pruning, resume behavior, or any Trials8 source.
