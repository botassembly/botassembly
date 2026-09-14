# Requirements: the library as the surface, and complete read-only administration

Planning note, 2026-09-14. Observed at `bot/src` on the Linux box. This note records six rulings Ian made on 2026-09-14, turns each into testable requirements, and proposes a ticket order. It changes no code.

## Rulings

All six are Ian's, 2026-09-14.

1. **The library is the surface.** A consuming application drives Bot through the importable library, not by spawning the CLI. Every read and every mutation the CLI offers must be reachable as an importable function that returns the same versioned document the command prints. This widens `sdlc/issues/2026-09-14-importable-readers-are-not-the-command-surface.md`, whose smallest outcome kept mutation out of the door.
2. **Read-only administration must be complete.** An operator console must understand the home, the configured models, the assemblies, where things live on disk, and the runs and sessions, including searching them. The benchmark Ian named is Pi's own command line.
3. **Text search may shell out.** Bot need not implement matching. A library function may spawn `rg` or `grep` and return a versioned document.
4. **The assembly hash belongs in `check` and `list` output.** Approved as filed.
5. **The intelligence override on resume and per stage is a recommendation, not an ask.** One answer, strong yes or drop.
6. **WSL qualifies on GitHub.** A third leg of the platform check runs inside WSL2 on a hosted Windows runner, free for this public repository, never on an ordinary push, and runnable on demand and on a release tag.

A seventh issue, `sdlc/issues/2026-09-14-a-credential-advisory-line-writes-to-stderr-on-every-command.md`, was filed after Ian's list (commit `b4aa4cc`) and is outside this note.

## Library as the surface

### What exists

`bot/package.json:7-11` exports four paths: `./inspection`, `./one-run`, `./record-lines`, `./session`. `bot/tests/importable-readers.test.ts:69-72` proves an outside package can import them, and `:60` asserts the door exposes no runtime and no mutation.

Two of those readings are not command readings. `inspectRuns` returns `{ schemaVersion: 1, runs }` (`bot/src/inspection.ts:198`), while `bot run list --json` returns `bot.run.list@1` with `data`, `page`, `summary`, and `warnings` (`bot/src/run-list-query.ts:6`). `inspectShow` is called by nothing in the package; `bot run show` builds `bot.run.show@1` in `bot/src/run-show.ts:178`. Both exported functions serve the retired `bot runs` and `bot show` vocabulary.

`bot/src/cli-contract.ts:9` declares 25 operations. Sixteen of them are read-only and nine mutate. Nothing is exported for any of them by name. `bot/package.json` declares no `types` field and no compatibility statement for the four paths. No page under `docs/src/content/docs/` documents the library.

### Requirements

- **L1.** Every operation in `CLI_CONTRACTS` (`bot/src/cli-contract.ts:445`) has an importable function reachable from a declared export path.
- **L2.** For every operation whose `output` names a `kind` and `schemaVersion`, the importable function returns that exact document, byte-identical to what the command writes in `--json` mode for the same inputs.
- **L3.** For every operation whose `output` is `{ kind: "raw" }`, the importable function returns the same bytes the command writes, plus the exit code and the fault the command would report.
- **L4.** A refusal reaches the importer as the same structured error envelope the command emits, with the same code, cause, and exit code. No importable function throws where the command would refuse.
- **L5.** `bot/package.json` declares `types` for every export path and states the compatibility rule for those paths alongside the schema versions they return.
- **L6.** The two unshared legacy readers, `inspectRuns` and `inspectShow`, stop being public.

### The testable rule for "complete"

One test iterates `CLI_CONTRACTS` and fails on any operation with no importable counterpart. For each operation it imports the package the way an outside consumer does (the symlinked-`node_modules` pattern already in `bot/tests/importable-readers.test.ts:39-40`), calls the function, runs the command with the same arguments, and compares the two documents. An operation added to `CLI_CONTRACTS` without an export breaks the build. That is the mechanical enforcement; no convention is remembered.

Mutation is inside this test because of ruling 1. `bot/tests/importable-readers.test.ts:60` asserts the opposite today and has to change. The door then admits `assembly.install`, `assembly.link`, `assembly.remove`, `assembly.update`, `auth.import`, `auth.login`, `auth.logout`, `run.start`, and `run.resume`. Private runtime internals, the lock helpers and the pruner, stay private.

## Read-only administration

### Bot against Pi's command line

Pi source at `~/foss/pi` is 0.84.2; the bundled copy is 0.85.1. Pi hand-rolls its argument parsing in `packages/coding-agent/src/main.ts:560` and has six subcommands: `install`, `remove`, `update`, `list`, `config`, `auth`.

| Pi capability | Pi command | Bot |
| --- | --- | --- |
| Version and build identity | `pi --version` | has: `bot capabilities` reports runtime, source, digest, tree hash |
| Command inventory | `pi --help` | has, and exceeds: `bot capabilities --json` is machine-readable |
| List installed extensions | `pi list` | has: `bot assembly list` |
| Install, remove, update an extension | `pi install`, `pi remove`, `pi update` | has: `bot assembly install`, `link`, `remove`, `update` |
| Read the effective configuration | `pi config` (interactive toggler) | **lacks**: nothing reads the home's `intelligences` table or its option defaults |
| Credential status | `pi auth check --provider P --json` | has: `bot auth list` |
| Print a raw API key or bearer token | `pi auth print-api-key`, `print-bearer-token` | no equivalent need: Bot redacts credentials by ruling |
| List models | `pi --list-models` | has, and exceeds: `bot model list` is paged and versioned |
| Browse sessions | `pi --resume` (interactive picker, searchable) | **lacks** the search; `bot run list` lists and `bot run session` reads one |
| Open a session by partial id | `pi --session ID` | has: prefix matching in `bot/src/one-run.ts:26-30` |
| Continue the most recent session | `pi --continue` | no equivalent need: a caller picks the run from `bot run list` |
| Export a session to HTML | `pi --export FILE` | no equivalent need |
| Override the storage directory | `pi --session-dir DIR` | has: `--home` and `BOT_HOME` |
| Machine-readable output | only `pi auth check --json` | has, and exceeds: every structured operation takes `--json` |
| Self-update | `pi update --self` | no equivalent need: the upgrade path is `git pull` (`Makefile:33`) |
| Print where things live on disk | none | **lacks**, and so does Pi |

Two capabilities Pi has that Bot lacks: reading the effective configuration, and searching sessions. A third, printing the paths, is missing from both and is still required by ruling 2. Pi has no `doctor`, no `status`, no session-list printer, and no JSON mode outside `auth check`, so Bot already exceeds Pi on administration everywhere else. The honest finding is that Bot's gaps against Ian's benchmark are the ones Bot's own issue files name, not gaps against Pi.

### Requirements

- **A1.** One read-only operation lists the home's intelligence names with provider, model, and required reasoning, in Markdown and JSON, refusing a malformed table the way `bot/src/home-config.ts:65-73` already refuses it. Today `home-config.ts:75-76` and `bot/src/options.ts:101` are the only readers of that table.
- **A2.** `bot home show` reports every path the runtime reads or writes for the selected home: the home, the configuration file, the runs directory, the cache directory, and the Pi authentication file, each with whether it exists. Today `bot/src/home-command.ts:41` returns only `home`, `initialized`, and `installationId`.
- **A3.** The operation inventory in `specification/elements/inspection.md:130` is checked against `CLI_CONTRACTS` by a test. The prose lists 24 operations and omits `auth.import`; `cli-contract.ts:9` holds 25 and `docs/src/content/docs/reference/commands.md:14-38` lists all 25.
- **A4.** Ruling 2 is satisfied when an operator console can answer, through importable functions alone, what this home is, where its files are, which models it may name, which assemblies it holds, which runs exist, what each run did, and which runs mention a given string.

## Search

### Design

One read-only operation, `run.search`, with command words `bot run search`. It returns `bot.run.search@1` in Markdown and JSON. It reads the home, mutates nothing, and reaches no network.

The pattern is a literal string, never a regular expression. `rg` and `grep` do not share a pattern dialect, so a regular expression would make the document mean different things depending on which tool answered. A literal means the same thing under both.

The operation resolves the run set through the existing `run.list` filters (`--assembly`, `--flow`, `--state`, `--cause`, `--since`, `--until`) and the same cursor shape, maps that set to session files under the run directories, then spawns one child with an explicit file list. It prefers `rg --fixed-strings --json --no-config` and falls back to `grep -n -F`. Each hit names the run, the stage, the repeat, the retry, the line number, and a bounded inert excerpt.

- **S1.** The document records which tool answered and its version, so a reader can tell what matched.
- **S2.** With neither tool on `PATH`, the operation refuses with the common `dependency-failed` result. It never falls back to matching in Bot's own code, because a second implementation would return different hits for the same question.
- **S3.** The descriptor's `limits` bound the files scanned, the hits returned, the excerpt bytes, the document bytes, and the child's wall clock. A run of hits past the bound pages like every other listing.
- **S4.** The importable function returns the same `bot.run.search@1` document. Spawning a search tool is neither runtime nor mutation, so it sits inside the export door under ruling 1.
- **S5.** No index is built and no query is stored. The disposable index the retired `bot find text` left in the operator's cache (`specification/CHANGELOG.md:86`) is not revived.

## Assembly hash

Bot already computes the number. `bot/src/run.ts:294` writes `assembly_hash` into `run_start`, and `bot/src/resume.ts:49-50` refuses a donor whose hash moved. Nothing prints it.

- **H1.** `bot assembly check` reports, in both output modes, the same hash `run_start` would record for the same resolved target.
- **H2.** `bot assembly list` reports the installed hash on each row, as a field in `ASSEMBLY_LIST_FIELDS` (`bot/src/cli-contract.ts:86`), selectable through `--fields`.
- **H3.** A test starts a run of a target, reads `assembly_hash` from the record, and asserts `bot assembly check` on the same target reported that exact string. No second hash rule is written.

## Model override on resume and per stage

**Recommendation: drop the new option on both counts, and close the resume half by inheritance instead.**

What resume does today: `bot/src/resume.ts:46-48` refuses every command option except `--home`, `--in`, declared slots, and `--id-file`, and `:49-50` refuses the resume outright when the assembly's hash has moved. Resume's whole design is that the continued run is the same program as the donor. `specification/elements/invocation.md:82` then resolves intelligence again from authored configuration, the home, and defaults, so a run started with `--intelligence fast` continues on whatever the assembly and home say.

That divergence is a real defect for a consuming application that recovers runs, and it needs no new command rung to fix. The donor's record already carries every effective value with its source rung (`bot/src/options.ts:71-73`). Resume should read the donor's recorded command rung and apply it, the same way it already reads the donor's request and its assembly hash. A recovered attempt then runs on the models the donor ran on, by construction, and a caller cannot get it wrong.

Adding `--intelligence` to `bot run resume` would instead let a caller change models mid-recovery, which contradicts the refusal at `resume.ts:50`: the command already says that a changed program means a fresh run.

The per-stage spelling should be dropped outright. Ruling 4 makes the assembly hash the identity a consumer pins and reports. A command-rung override that repoints one named stage changes what actually runs while leaving the hash untouched, so the hash would stop identifying the work. Per-stage model choice already has a home: the stage rung in the assembly, which is inside the hash. No consumer exists for the command-line form.

- **M1.** `bot run resume` applies the donor's recorded command-rung intelligence, and the new run's record shows that value with its source rung.
- **M2.** `bot run resume` still refuses `--intelligence` as an unknown option.
- **M3.** A test resumes a donor started with an override and asserts both runs recorded the same effective provider and model.

## The WSL leg

### What changes

`.github/workflows/runtime.yml` has two jobs, `check` on `ubuntu-latest` and `platform` on a `[ubuntu-latest, macos-latest]` matrix, both firing on every pull request and every push to main. `sdlc/scripts/platformcheck:11-15` accepts `Linux` or `Darwin` from `uname -s` and refuses anything else.

- Add `workflow_dispatch` and `push: tags: ['v*']` to the workflow's `on:` block.
- Add a third job, `wsl`, guarded by `if: github.event_name == 'workflow_dispatch' || startsWith(github.ref, 'refs/tags/v')`, so an ordinary push skips it at no cost. GitHub-hosted Windows runners are free for public repositories.
- The job runs on `windows-2025`, where `Vampire/setup-wsl@v7` installs WSL2 by default. Pin the action by commit SHA, the convention every action in the file already follows.
- Set `defaults.run.shell: wsl-bash {0}` so each step runs inside the distribution, and set `timeout-minutes` so a hung lock test cannot burn an hour.
- `sdlc/scripts/platformcheck` needs no behavior change. WSL2 reports `Linux` from `uname -s`, and `bot/src/cli.ts:137` refuses only `win32`, which Node inside WSL never reports. Its line 2 comment says the script is shared by the Linux and macOS jobs; update it to name three legs.

### Traps to design around

- **W1.** A checkout made by `actions/checkout` lands on the Windows filesystem and appears inside WSL under `/mnt/c`, a DrvFs mount with no POSIX ownership or mode bits. `platformcheck:20` exercises locking, atomic install, ownership, and signals, and ticket 0277 requires effective-user-owned private real files. The check must run from the distribution's own ext4 filesystem. Clone inside WSL at the exact SHA, which also matches the release rule's clean-clone wording in `sdlc/planning/plan.md`.
- **W2.** `setup-wsl` runs as root by default and creates no ordinary user. Both existing platform steps assert `test "$(id -u)" -ne 0`. The job must create a user and make it the distribution's default before the check runs.
- **W3.** `actions/setup-node` installs Node on the Windows side, not inside the distribution, so the WSL leg cannot use it. Install Node 22.22.0 inside WSL to match the other two legs, and pin the version.
- **W4.** There is no npm cache inside the distribution. `make -C bot install` runs cold every time. The leg is rare, so this is accepted rather than solved.
- **W5.** The leg uses `make -C bot install` and `make platformcheck`, exactly as the existing `platform` job does. It does not run `sdlc/scripts/install`, which also builds the documentation site.

## Proposed ticket sequence

1. Add the failing contract test that asserts every operation in `CLI_CONTRACTS` has an importable counterpart returning the same document.
2. Export the existing command readings through the package door, retire `inspectRuns` and `inspectShow` as public, and turn the read-only half of that test green.
3. Admit the nine mutating operations to the export door under ruling 1, and replace the assertion at `importable-readers.test.ts:60` with one that names the internals that stay private.
4. Declare `types` and the compatibility rule for every export path in `bot/package.json`.
5. Check the specification's operation inventory against `CLI_CONTRACTS` and add the missing `auth.import`.
6. Report the assembly hash in `bot assembly check` and as a field of `bot assembly list`.
7. Report the configuration file, runs directory, cache directory, and authentication file paths in `bot home show`.
8. Add one read-only operation that lists the home's intelligence table.
9. Add `bot run search` over a home's session files, spawning ripgrep or grep.
10. Make `bot run resume` inherit the donor's recorded command-rung intelligence.
11. Add the WSL leg to `.github/workflows/runtime.yml` and widen the `platformcheck` comment.

Tickets 1 through 4 come first so that every command added in 6 through 9 ships with its export or breaks the build.

## Open questions for Ian

Ruled by Ian, 2026-09-14: the importable `run.start` and `run.resume` functions start the run in a child process and return the same document the command prints. In-process run execution is not promised. Every other operation runs in the importer's process. The question below is answered and stays for the record.

- Ruling 1 admits `run.start` and `run.resume` to the importable door. A consuming application that starts runs in its own process shares that process's lifetime with the run. Bot's locking and signal handling were designed for a CLI process that owns its run. Whether the library contract promises in-process run execution, or promises only that the mutation is reachable and still uses a child process, is a design commitment worth Ian's ruling before ticket 3.
