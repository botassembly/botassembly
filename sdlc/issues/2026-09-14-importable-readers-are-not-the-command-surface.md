# The importable readers are not the command surface

Observed 2026-09-14 at commit `44d8dbf` on the Linux box.

`bot/package.json` exports four modules: `./inspection`, `./one-run`, `./record-lines`, and `./session`. `bot/tests/importable-readers.test.ts` pins them as an outside consumer's door and asserts that runtime and mutation stay out of it. Two of the readings behind that door are not the readings the commands give.

- `inspection.inspectRuns` and `inspection.inspectStatus` are exported only through `public-inspection.ts:2`. No command calls either one. `inspectRuns` returns `{ schemaVersion: 1, runs }` (`inspection.ts:198`), while `bot run list --json` returns `bot.run.list@1` with `data`, `page`, `summary`, and `warnings` from `run-list-command.ts`. The two shapes never agree, and the importable one carries no `kind` and no cursor.
- `one-run.inspectShow` is likewise called by nothing in the package. `bot run show` is `run-show-command.ts`, and its `bot.run.show@1` document is built in `run-show.ts:178`.
- Both exported functions are the readings `bot runs` and `bot show` used before they were retired (`bot/tests/cli-legacy-retirement.test.ts:13-16`). So the door serves a vocabulary the command surface no longer serves.
- `inspectSession` is the good case: `run-session-command.ts:124` calls the same function an importer calls, so a session reads the same way through both.
- Nothing is exported for `capabilities`, `assembly.check`, `assembly.list`, `home.show`, `home.busy`, `model.list`, `run.list`, or `run.show`. A reader that imports the library must still spawn a process to discover what the runtime supports or to list what a home holds.

A reader that imports the library in process, so that it never spawns `bot` per page, is the consumer. Today it either spawns anyway or reads documents no contract describes. `package.json` also declares no `types` and no version discipline over these paths, so the door has no stated compatibility.

Smallest outcome that closes it: every read-only operation in `bot capabilities` is reachable as an export that returns the same versioned document as the command, the two unshared legacy readers stop being the public door, and the export paths state their compatibility alongside the schema versions they return. Mutation and run creation stay out.

Review trigger: 2026-12-14, or the first importer that parses an exported reading.
