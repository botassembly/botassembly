---
flow: build
priority: 2
deps: [0281, 0283, 0284]
---
# Verify documentation accuracy and example transcripts

## Outcome

Every runtime claim left on the rebuilt site matches what the runtime prints, and a check keeps it that way. Each shipped example's `bot assembly check` transcript is compared to real output on every gate run, so a wrong README cannot publish a wrong site while `make check` stays green.

## Current facts

Verified at HEAD `9699a10`.

- `sdlc/scripts/examples:54` runs `node "$REPO/bot/src/cli.ts" assembly check "./$name" --home "$HOME_DIR" --json > /dev/null 2>"$CHECK_ERROR"` and keeps only the exit status. Nothing compares output to prose.
- The gate's throwaway home names `google` / `gemini-2.5-flash-lite` / `low` (`sdlc/scripts/examples:28-33`). The README transcripts were pasted against `gemini-3.5-flash-lite`, so the gate's own home cannot reproduce them.
- `examples/` holds `brief`, `data`, `hello`, `outline`, and `triage`. `data` holds sample requests and is not an assembly. The flows are `brief/brief`, `hello/greet`, `outline/plan`, and `triage/triage`.
- Each example README carries a ```console fence holding the command, the check output, `$ echo $?`, and the status. `docs/scripts/walkthrough-steps.mjs:27` republishes `triage/README.md` on the site.
- `bot assembly check` accepts `--home`. Running `bot assembly check ./triage/triage --home <temporary home>` from `examples/` at HEAD printed the six lines in `examples/triage/README.md` byte for byte, exit 0, with nothing on stderr.
- `docs/scripts/extract-walkthrough.test.mjs:152` parses that fence and asserts its shape, never its truth. Drift already happened undetected before ticket 0279.
- Accuracy problems 1, 3, and 4 from the 2026-09-14 assessment remain: the human `bot assembly check` refusal prints one line while the site promises a code, a path, and a repair; a successful run also writes the retired-credential-store warning to stderr while the site says stderr carries diagnostics only; `--limit` defaults to 20 rows with an `--after` cursor while the site says one row per reachable node.

## Scope

Add one offline test that pins every shipped example transcript.

- For each directory under `examples/` that holds an `ASSEMBLY.md`, skipping `examples/data`, and for each flow under it, run `node bot/src/cli.ts assembly check ./<assembly>/<flow>`, the binary `sdlc/scripts/examples` already runs, and treat the README's `$ bot` prompt line as prose the comparison ignores. The working directory is `examples/`.
- Pass no `--json`. Pass `--home` naming a temporary private home whose `config.yaml` defines the intelligence `default` as provider `google`, model `gemini-3.5-flash-lite`, reasoning `low`. Remove the home afterwards.
- Compare stdout bytes and exit status to the ```console fence in that example's README. A difference in either fails and names the example.
- The test calls no model, reads no operator home, and needs no credential.
- Change `sdlc/scripts/examples:32` to `gemini-3.5-flash-lite` so one home serves both the gate and the transcript test.

Then make the site true.

- Remove accuracy problems 1, 3, and 4. Ticket 0281 settles what `bot assembly check` renders, and ticket 0283 settles the model failure text, so verify each surviving claim by running the command at this ticket's base rather than by reading the assessment.
- Update every affected page on the rebuilt site, including *Run the shipped example*, *Reading a record*, *When it refuses or fails*, and the command reference.
- Repaste any example transcript the runtime changes, from real output, and repaste the walkthrough source the site republishes.

Out of scope: the sidebar, the page list, and the redirects, which ticket 0284 owns. Problem 6 lives in `specification/`, which ticket 0282 owns. No change to `bot/src`.

## Acceptance

Start with the failing transcript test.

- The new test fails on a hand-edited README fence, fails on a changed exit status, and passes on all four shipped flows.
- The test is part of the gate, so `make check` runs it.
- `cd docs && npm run build` exits 0 with no new warning.
- `node --test docs/scripts/*.test.mjs` passes, with `extract-walkthrough.test.mjs` still pinning the republished fence.
- Each claim this ticket repairs is proved by a pasted command run at the ticket's base.
- `make check` passes.
- One reviewer reads the Start and Operate paths as a newcomer, runs the commands the pages show, and records that read-through as a code-review finding.

## Dependencies

Ticket 0281 owns the check row shape and the transcripts this test pins; ticket 0283 owns the model failure text. Ticket 0284 owns the page structure this ticket edits, so this work rebases onto all three before it starts.

## Risk facts

The test binds the examples to installed runtime output, so any later change to check rendering reddens the gate until the READMEs are repasted. The test depends on a model name that no provider call validates, so a renamed model in a README and in the test must move together.

## Size decision

Production size does not change. This ticket adds a test and edits documentation and example READMEs. It adds no runtime code.

## Complexity

- Contract score: 1
- State and timing score: 0
- Reach score: 1
- Proof score: 2
- Cost of error score: 1
- Total: 5
- Minimum level floor: none
- Final level: 2
- Reasons: The claims are several explicit public cases on one documentation surface. Proof scores 2 because the transcript comparison is an exact-byte proof across every shipped example.
- Selected model: `claude-opus-5` with medium reasoning implements, because CLAUDE.md sends build work to Opus. Independent design review and code review also use `claude-opus-5` with medium reasoning.

## Review

- Origin: finding M8 in `sdlc/planning/notes/2026-09-14-review-recent-work.md` and accuracy problems 1, 3, and 4 in `sdlc/planning/notes/2026-09-14-review-docs-site.md`. Design review split this outcome out of ticket 0284 so the structural rewrite could start without waiting on 0281 and 0283.
- Design review: accepted after one correction.
- Code review: pending
