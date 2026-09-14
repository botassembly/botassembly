# The home's intelligence table has no reader

Observed 2026-09-14 at commit `44d8dbf` on the Linux box.

A home's `config.yaml` holds the `intelligences` table. `home-config.ts:75-76` is the only code that reads it, and `options.ts:101` resolves a name through it. No command and no export prints it.

- `bot capabilities --json` lists 25 operations. None reads authored intelligence names.
- `bot home show --home DIR` prints the home path, `Initialized: yes`, and the installation id. `specification/elements/inspection.md:53` scopes it to installation identity.
- `bot model list [provider]` lists the provider catalog Pi can reach, not the names an assembly may use.
- `bot config` was retired with no replacement. `bot/tests/cli-legacy-retirement.test.ts:16` pins it as refused.

So the only way to learn what `--intelligence NAME` may say, or what `default` currently points at, is to open `config.yaml` and parse YAML. The same is true of writing it: `README.md` tells an operator to edit the file in an editor, and a program that wants its own home for an isolated measurement has to author that YAML itself, against a shape only the runtime defines.

Two callers need this. A reader that shows a person the home, its assemblies, and its model choices through supported operations has nothing to call for the third one. A harness that runs each measurement in a home of its own has to write a runtime-owned file by hand before the first run will start.

The stale-result half of this — a named set of intelligences carrying a version or fingerprint, so that repointing a name invalidates an old measurement — was the finding in `2026-09-09-optimizer-needs-a-pinnable-intelligence-set.md`, retained on 2026-09-12 and closed in `sdlc/planning/plan.md` for want of a consumer. This issue is the plainer half and does not ask for a fingerprint.

Smallest outcome that closes it: one read-only operation lists the home's intelligence names with their provider, model, and reasoning, in both output modes, refusing a malformed table the way the ladder already refuses it. Writing the table can stay manual.

Review trigger: 2026-12-14.
