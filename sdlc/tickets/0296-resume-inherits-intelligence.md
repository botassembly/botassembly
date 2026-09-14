---
flow: build
priority: 2
deps: []
---
# Resume inherits the donor's command-rung intelligence

## Outcome

`bot run resume RUN` runs on the intelligence the donor's command rung named, and the new run's `stage_start.options` carries `intelligence`, `provider`, `model`, and `reasoning` at rung `command` with the donor's values. Resume still refuses `--intelligence`. This ticket closes `sdlc/issues/2026-09-14-intelligence-override-misses-resume-and-one-stage.md` by ruling: the per-stage half is dropped, because the assembly hash must identify what runs and a command option repointing one stage leaves it untouched.

## Current facts

Observed at `deab1b2`, `bot/src` 18899 nonblank lines, on the Linux box.

- `bot/src/invocation.ts:207` puts `--intelligence NAME` into `commandOptions`, and only `OPTION_NAMES` land there. `:203` retires `model`, `provider`, and `reasoning` as `key-unknown`, so the name is the only inheritable value.
- `bot/src/options.ts:43` reads that map as the `command` rung and `:71-88` stamps it on all four values.
- `run_start` records no intelligence, and `model_source` is not a rung: `specification/elements/record.md:138-141` gives it one value, `scripted`. The stage ladder is the only record of the name. `bot/src/machinery.ts:33-38` builds `{ name, value, rung }` entries and `bot/src/record-events.ts:126-137` writes them as `stage_start.options`, so a donor run with `--intelligence fast` holds `intelligence`, `fast`, rung `command`, on every `stage_start`.
- `bot/src/resume.ts:42` resolves a fresh invocation from the donor's target, so the ladder falls to the assembly, the home, and the defaults (`specification/elements/invocation.md:82`). `:46-47` refuses any command option with `Use only --home, --in, declared slots, and --id-file.` That is M2 and it stands.
- `bot/src/continuation.ts:26-34` carries the donor's `events`, and `bot/src/reader.ts:79` returns the invocation object it was given, so an amended invocation reaches option resolution.

## The source decision

Resume adopts the first `stage_start` whose `options` holds `intelligence` at rung `command`. It adopts the name because the home table turns a name into a model. A donor that recorded no `stage_start`, or whose ladder names no `command` rung, inherits nothing: resume resolves through the assembly, the home, and the defaults as today. A dropped name refuses with `intelligence-unresolved` before birth.

## Scope

1. In `bot/src/resume.ts`, add one function reading `donor.events` for that name.
2. In `prepare`, after the hash check, return a `resolved` whose `invocation.commandOptions` holds `{ intelligence: NAME }` when a name was found, and amend nothing otherwise. The refusal at `:46-47` runs first and guarantees `commandOptions` is `{}` there.
3. Add no option to the resume descriptor in `bot/src/cli-contract.ts`, and no per-stage spelling.
4. Replace the sentence at `specification/elements/invocation.md:82` that resolves intelligence again: resume adopts the donor's recorded command-rung name, resolves it through the current home table, records it at the `command` rung, resolves the three loose options again, still refuses `--intelligence`, and resolves as before when the donor recorded none. Add one sentence near `:111-119`: the command rung is run-wide, has no per-stage spelling, and per-stage choice is the stage rung.
5. Leave `specification/elements/record.md` unchanged. Its per-stage prose already promises the resolved options and their rungs.
6. Add one `specification/CHANGELOG.md` paragraph under `## 2026-09-14`, beginning "Ticket 0296", naming the inheritance, the standing refusal, and the dropped per-stage form.
7. Delete the issue file in the same commit, and raise `sdlc/ratchet.json` to the measured total with the required justification.

## Acceptance

Start red. Add one test to `bot/tests/run-resume.test.ts`, which holds the donor fixture at `:26-35` and the resume helper at `:37-47`. `bot/tests/cli-boundary.ts:64` builds the shared faux provider with the single model `faux-1`, so the second row names `faux-1` too and differs by reasoning: `fast: { provider: faux, model: faux-1, reasoning: low }` beside the default row on `medium`. The test widens no model list, and stays honest because `intelligence` and `reasoning` differ between the rows and each entry carries its rung.

Start the donor with `--intelligence fast`, resume it, read the first `stage_start` of each record, and assert the four entries match in value and rung at rung `command`. A second case starts a donor without the option and asserts rung `assembly`. No model call is needed: the faux provider answers both runs from scripted responses, as `:29-33` and `:43` do.

## Size decision

- Starting production size: 18899 nonblank lines
- Ending production size: 19079 nonblank lines
- Production code added: about 11 lines in `bot/src/resume.ts`.
- Production code deleted: None.
- Simpler approach tried: accept `--intelligence` on resume.
- Why insufficient alternatives were rejected: an accepted option lets a caller change models mid-recovery, against the refusal at `:46-47`. A `run_start` field duplicates the ladder. Copying the resolved model is inexpressible (`invocation.ts:203`).
- Accepted cost: a recovered run can refuse on a dropped name.

## Complexity

- Contract score: 1
- State and timing score: 2
- Reach score: 1
- Proof score: 1
- Cost of error score: 1
- Total: 6
- Minimum level floor: level 3. `complexity-routing.md:19` sets that floor for recovery, and this ticket writes the option-resolution rule for `bot run resume`, the recovery path. The floor applies even though the change reads one name from a record in hand.
- Final level: 3
- Reasons: the change edits one public command's resolution rule and two specification sentences. It decides what a recovered run executes on, and a wrong result silently continues an attempt on a different model.
- Selected model: `claude-opus-5` medium implements; `claude-opus-5` medium reviews

## Review

- Origin: the issue filed 2026-09-14 and proposed ticket 10 in the 2026-09-14 admin surface and library requirements note.
- Design review: rejected once for an unrunnable fixture model, the unaddressed recovery floor, five wrong cites, and two thin edge cases. Accepted after revision.
