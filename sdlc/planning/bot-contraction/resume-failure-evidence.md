# Resumed-stage failure evidence

## Boundary

Resume already finds the contiguous successful plain-stage prefix and restarts at the next root node. Failure evidence applies only when that next node is a plain `STAGE`, the donor's final unsuccessful `stage_end` has the same root identity, and the terminal `run_end` agrees with its exit and cause. Current ordinary failure endings may omit stage identity from `run_end`; an identity that is present must agree. A `signal` outcome does not qualify. A container remains the restart boundary and receives no nested-stage diagnostic.

The first fresh stage keeps the source a clean run would provide. That source is the retained request when no stage was carried. Otherwise it is the last carried output. The failure evidence joins that source as one additional file. No later stage receives it unless the first fresh stage chooses to describe it in its own successful output.

## Artifact

`continuation.ts` owns interpretation of donor events. It produces deterministic JSON bytes with these fields:

```json
{
  "kind": "bot.resume-prior-failure",
  "donor_run": "2026-09-03T21-39-40-2c3b",
  "stage": "03-code",
  "retry": 1,
  "exit": 2,
  "cause": "fault",
  "reason": "$TMP exceeded its ceiling.",
  "reason_bytes": 29,
  "reason_truncated": false
}
```

`reason` is null when the donor recorded none. The complete newline-terminated artifact is at most 4,096 UTF-8 bytes. Truncation preserves a valid UTF-8 prefix and sets `reason_truncated` while retaining the original UTF-8 byte count. JSON escaping keeps control characters inside the value. The fixed `kind` identifies the content as evidence rather than instructions.

`run.ts` copies the deterministic bytes to a fixed runtime-owned path in the new run and computes their SHA-256 once. The input name starts as `bot-resume-prior-failure.json`. A deterministic numeric suffix selects the first name whose stem does not collide with the ordinary source. The first fresh stage's existing `stage_start.received` row binds the selected name, retained path, and SHA-256. The initial prompt names the selected file and labels its fields as data from the prior attempt rather than new instructions. No new record event or field is needed.

## Code locality

- `continuation.ts` selects and bounds the applicable donor fact.
- `run.ts` retains the bytes in the new run and combines the evidence source with the request or final carried source.
- `prompt.ts` and the narrow prompt-construction call path carry the selected evidence name so the first turn can label that input as prior-attempt data.
- `execution.ts` keeps the existing `FlowSource` and `initialSources` contracts unless implementation reveals a smaller internal type change.
- The invocation, prompt, slots, and record specification chapters describe the extra resume-only input and its existing `received` binding.

The design does not reopen donor sessions, copy donor diagnostics, or teach the structural record validator the writer's detailed continuation rule.

## Red tests

1. A three-stage run fails its third plain stage on a resource condition. Resume carries the first two outputs. The fresh third stage sees its ordinary predecessor plus the JSON evidence. Its retained first turn names the evidence file and labels its fields as prior-attempt data rather than instructions. The stage reads the named failure, changes its action, and succeeds.
2. A first-stage failure resumes with the retained request plus the evidence file.
3. Missing reason produces `reason: null`. A long Unicode reason yields valid JSON no larger than 4,096 bytes with truthful byte and truncation fields.
4. An ordinary source whose stem collides with the preferred evidence name causes a deterministic suffixed name. Neither source is overwritten.
5. The retained artifact bytes hash to the `stage_start.received` digest. The donor record remains byte-identical. The evidence contains no transcript, failed output, check capture, hook output, or scratch bytes.
6. Successful donors, mismatched terminal facts, outside signals, and failures inside a restarted container add no evidence. Their current stage inputs remain unchanged.
