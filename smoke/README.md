# The smoke ladder

Ten live-model acceptance runs, escalating, and one rung that costs nothing and
inspects what they left. Each rung exercises one more of the format's promises
against a real provider, and each rung's verdict is a machine's, not a reader's.

```sh
make smoke              # every rung, in order, stopping at the first failure
make smoke SMOKE=3      # one rung
make smoke SMOKE="7 8"  # two
smoke/run.sh            # the same, without make
```

**The numbers are not the order.** S1-S5 run first, then ticket 0141's S7-S11,
and S6 runs LAST because its whole subject is the wreckage of the rungs above
it. S6 keeps the number it has had since ticket 0069: `smoke/run.sh 6` is what
the falsification ledger, the handoffs and this file have always named, and
renumbering the inspection rung would have made every one of those sentences
quietly wrong about which rung was broken on purpose.

**A fresh worktree cannot run `make smoke` until `npm ci` has been run in
`bot/`.** The ladder invokes `node bot/src/cli.ts` directly, so without
`node_modules` every rung dies with `ERR_MODULE_NOT_FOUND`, leaves no run, and
the validator has no record to read.

## The doctrine

- **Never part of `make check`.** `make check` is the gate: deterministic,
  offline, and run on every change. The ladder calls a real model and costs
  real money, so a human (or an agent told to) runs it deliberately. The two
  never merge.
- **Escalatory.** The rungs run in order and stop at the first failure. S1
  proves the plumbing; there is no point asking S5 about subflows when the
  loop itself is broken. Cheap before expensive, for the same reason: S7, S8
  and S9 cost about 2k each and are allowed to fail before S11 spends 8k.
- **Failure is forced by machinery, never hoped for.** A rung that needs
  something to go wrong makes it go wrong with a gate, a hook or a clock — the
  deterministic parts of an assembly. Where a rung tests the MODEL, it tests it
  against one explicit sentence a low-reasoning model can follow, and a model
  that does not follow it is a finding about the pair rather than a fixture to
  soften (S8's `refuse` is the sharp end of this).
- **Real model, cheapest honest settings.** `intelligence: smoke`,
  `timeout: 300`, and `retries: 2` in each fixture's frontmatter. The scratch
  home's `smoke` row maps to `gpt-5.6-luna` with low reasoning. Auth arrives the way it arrives on any machine:
  bot's own credential file, `${XDG_CONFIG_HOME:-$HOME/.config}/bot/credentials.json`,
  filled once by `bot auth import`. The driver reads one number from it,
  `expires`, and refuses to start when the token has under fifteen minutes of
  margin. It never writes that file and never prints a token.
- **Determinism without a deterministic model.** Nothing here passes because
  the prose looked right. Every rung is judged by its `validate.mjs`, which
  reads `record.jsonl`, the sealed outputs, the check captures and the
  sessions, and asserts named facts about **secret words** — canaries. A
  canary that rides the request is minted per invocation by the driver; a
  canary that lives in a fixture (a skill's word, a hook's marker, a branch's
  token) is a fixed string, because distinctness is what matters there and
  not unpredictability. **No canary is ever a credential.**
- **Run artifacts are never committed.** Runs execute from a non-repo `$PWD` with `BOT_HOME` and `XDG_CACHE_HOME` pointed at a scratch session the driver creates under `SMOKE_HOME_ROOT`. When `SMOKE_HOME_ROOT` is unset, the driver uses `${TMPDIR}/bot-smoke`. When `TMPDIR` is unset, it uses `/tmp/bot-smoke`. The driver normalizes that root before it adds the session name, so a `TMPDIR` that ends in a slash does not create a different spelling of the same home. The driver prints that path so a human can read the wreckage:

  ```sh
  BOT_HOME=<the printed home> node bot/src/cli.ts run list --limit 200 -j
  BOT_HOME=<the printed home> node bot/src/cli.ts run show <run> -j
  ```

  Nothing a run writes lands inside this repository. If `git status` ever
  shows a run directory, a record, or a `.jsonl` artifact, that is a bug in
  the driver, not something to add to `.gitignore`.
- **A red rung is a finding first.** Triage before you touch anything: is the
  infrastructure lying, or did the model fail the task? Only model weakness
  with honest infrastructure justifies raising `reasoning` for that one
  rung's frontmatter, and it gets written down. Never add retries beyond 2.
  **Never loosen a validator to make a rung pass** — a validator that has
  been weakened proves nothing, and this whole tree is worth exactly what its
  validators are worth.
- **A smoke session must break at least one rung on purpose before reporting
  green.** Two green ladders that nobody falsified is weaker evidence than it
  looks: a validator that has never been made to fail is a validator nobody has
  seen work. Ticket 0067 shipped an assertion unexecuted and 0069 found it had
  been passing vacuously — it derived directory names from *file* paths, so the
  empty directory its entire job was to catch was invisible to it. Break
  something real (delete a canary from a sealed output, flip an expression in a
  `validate.mjs`, point a path at nothing), watch the named assertion go red,
  restore, and write the break down in **`falsifications.md`** — the date, the
  rung, what was broken, and the assertion name that went red. Nothing recorded
  it before, so the rule's own history was unverifiable: whether it had ever
  been kept was exactly as unknowable as the vacuous pass it was written
  against. `run.sh` does not enforce the ledger and cannot; it makes the
  discipline auditable, which is all a ledger is for.

## The rungs

In the order they run:

| Rung | Fixture           | Cost | What it proves |
| ---- | ----------------- | ---- | -------------- |
| S1   | `s1-plumbing/`    | ~1k  | auth, provider, the agent loop, the record, the session, stdout-is-the-answer |
| S2   | `s2-taught/`      | ~4k  | the three checks in order, and the send-back loop carrying a gate's words to a real model that acts on them; a stage that cannot pass failing out loud, with its `failure` hook seeing `$CAUSE` |
| S3   | `s3-disclosure/`  | ~3k  | flattening, narrowest-first override, information hiding and disclosure-on-demand — one skill name at three scopes, three words, checked from artifacts alone |
| S4   | `s4-graph/`       | ~4k  | a real chooser taking a named branch, absence-as-evidence for the branch not taken, `before` and `success` hook slots |
| S5   | `s5-works/`       | ~8k  | fan-out delivery, the delegation round-trip through a real child run, a skill inside that child, and invariant 38's scope isolation across the subflow boundary |
| S7   | `s7-skipped/`     | ~2-3k | the `mark` tool's DECISION dimension: an item the request cannot satisfy is marked `skipped` with a reason, and the checklist check passes anyway — a skipped item is an addressed item |
| S8   | `s8-refused/`     | ~2k  | `refuse` reached by a real model on one explicit sentence: exit 1, `run_end 1/refused`, nothing sealed anywhere, the cause line on stderr, and `bot run output ... --raw` refusing a run that has no answer |
| S9   | `s9-clock/`       | ~1-2k | a real provider aborted mid-turn by the agent's own clock (`timeout: 1`): `1/timeout`, an unsealed ending, a record whole to its last line, and the spend the run had already made still in it |
| S10  | `s10-lifecycle/`  | ~1-2k | the tool as a person holds it: `bot assembly install`, the listing, `bot run start <name>/<flow>` with the request on STDIN, the record naming the REGISTERED name, `bot run output ... --raw` byte-for-byte, and `bot assembly remove` leaving the run's record standing |
| S11  | `s11-loop/`       | ~6-8k | the last container and the last control tool: three repeats, `continue` answered each time, `loop_done` ended by `stop` and not the cap, the tail receiving the CONTAINER's name — and disclosure note A re-measured against a live scratch tree and a live session |
| S6   | `s6-inspection/`  | 0    | current read-only commands against the runs the rungs above just made: `run list --limit 200 -j`, `run show -j`, `run record --raw`, `run output --raw`, `run session`, and `assembly check` each saying something true about a live record; one reading uses `--home` instead of the variable |

## The shape of a rung

```text
s4-graph/
  assembly/         the fixture assembly, run by explicit path
  validate.mjs      reads the run and asserts; exits 0 or 1
```

The assembly sits in its own folder because an assembly holds no other entry
than `ASSEMBLY.md`, `flows/`, `skills/`, `subflows/` and a README — the
validator would be refused by `bot assembly check` if it sat beside them.

**S10 is the exception among the fixtures: its assembly is installed into the
home and run by NAME**, which is the one shape a person actually uses and the
one no rung had ever taken. The fixture on disk is the install's source; what
runs is the home's copy of it, and the rung ends by removing that copy while the
run's record stays where it is.

**S6 is the exception, and deliberately so: it has no `assembly/`.** It calls no
model, spends no tokens and creates no run. Its subject is the wreckage of the
rungs above, found through `bot run list --limit 200 -j` in the `$BOT_HOME` every rung shares, so
it is only meaningful after them — asked to run alone (`smoke/run.sh 6`) it
finds nothing and goes red by name. It exists because until ticket 0069 the
ladder exercised the current run commands through an
`awk` for a token count with its output never asserted. If `show`'s columns had
moved, the ladder would have reported no tokens and passed every rung anyway.
S6 now reads token totals through `bot run list --fields id,tokens --limit 200 -j`, parses the
record through `bot run record --raw`, and reads stage and subflow facts through
`bot run show -j`. It reads accepted answers through `bot run output --raw` and
uses the supported command surface. Complete record reading uses `bot run events`.

`smoke/lib.mjs` holds the reading and asserting every validator shares: no
dependencies, standard library only (ADR 0010). A validator is a script that
reads the record and asserts, not a framework.

## Reading a rung that went red

Each assertion prints its own name, so the failure names itself:

```text
  ok    the chooser chose apple
  FAIL  no banana event exists in the record — [{"stage":"02-decide/banana",…}]
```

Then go to the wreckage the driver printed and read the run: `bot run show <run> -j`
for machine-readable scratch paths, `bot run record <run> --raw` for the exact record,
`bot run session <run> <stage>` for the transcript, and the run
directory itself for the outputs and the check captures — what the agent was
told, in the bytes it was told in.

## The old smoke history

An earlier `sdlc/planning/smoke/` tree held the 0010/0014-era fixtures —
a different provider, validated by eye. It was removed in the 2026-08
planning cleanup and lives only in git history. This directory is the
only smoke ladder.
