// Shared reading and asserting for the smoke ladder's validators. Standard
// library only (ADR 0010). A validator names each assertion; the name is what
// a reader sees when it goes red, so it states the fact, not the mechanism.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const failures = [];

/** Assert one named fact. Prints the name either way; red is what exits 1. */
export function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  ok    ${name}`);
    return true;
  }
  failures.push(name);
  console.log(`  FAIL  ${name}${detail === "" ? "" : ` — ${detail}`}`);
  return false;
}

/** Exit 0 when every named fact held, 1 when any did not. */
export function verdict() {
  if (failures.length === 0) {
    console.log("  validator: all assertions held");
    process.exit(0);
  }
  console.log(`  validator: ${failures.length} assertion(s) failed: ${failures.join(", ")}`);
  process.exit(1);
}

/** The record's events, in the order they were appended.
 *
 * A run that never started leaves no record, and reading one that is not there
 * is how ticket 0069 item 4 turned an honest `run none` into an unhandled
 * `ENOENT: record.jsonl` stack trace. README promises each assertion names
 * itself, so an absent or unreadable record is ONE named failure and the
 * verdict — not a throw, and not a silent empty list either: nothing after it
 * could be judged, so there is nothing to soften. */
export function record(runDirectory) {
  if (runDirectory === "") {
    check("the rung left a run to judge", false, "no run directory — `bot run` produced none");
    verdict();
  }
  const path = join(runDirectory, "record.jsonl");
  if (!existsSync(path)) {
    check("the run left a record to judge", false, `no such file: ${path}`);
    verdict();
  }
  const held = [];
  for (const line of lines(path)) {
    try {
      held.push(JSON.parse(line));
    } catch {
      check("every line of the record is one JSON object", false, `${path}: ${line.slice(0, 120)}`);
      verdict();
    }
  }
  return held;
}

// The ladder's own CLI, resolved from this file rather than from `$PATH`: a rung
// asserts the tree it is standing in, never whatever `bot` happens to be
// installed. Needs `npm ci` in `bot/` — see README.
//
// Through a SYMLINKED path `node bot/src/cli.ts` USED to be a silent no-op —
// exit 0, no stdout, no stderr — because cli.ts compared `import.meta.url`,
// which node resolves through symlinks, against `process.argv[1]`, which keeps
// the link. Ticket 0070 resolved both sides of that guard, so the CLI is now
// immune on its own; resolving here too costs nothing and keeps a rung
// asserting one file rather than a spelling of it.
const CLI = (() => {
  const path = fileURLToPath(new URL("../bot/src/cli.ts", import.meta.url));
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
})();

// The home every verb below will read, refused rather than assumed (ticket
// 0090). Nothing in this file sets $BOT_HOME — run.sh does, out of the session
// directory it names in $SMOKE_SESSION — and those two came apart: the free
// re-run returned before run.sh's exports, so a rung judged the operator's real
// bot home while the command line named a wreckage directory, and 32 assertions
// reddened on a session that was perfectly healthy. Moving the exports fixes
// that once; checking here is what makes the next variant of it impossible to
// miss, because this is the process that spawns the verbs, it is reached by
// every rung rather than only the path that broke, and the two facts it
// compares arrive by independent routes rather than off the line above.
// Refusal is exit 2, run.sh's code for a fault that is not a red assertion, and
// it is checked on import so no validator can assert anything first.
//
// The third clause says out loud the one thing the verbs will not: `bot run list`
// against a home that is not there exits 1 with empty stdout AND empty stderr,
// which is why this went unnoticed — the assertion `bot run list writes nothing to
// stderr` PASSED while the verb had failed completely. Whether that silence is
// defensible is a question for `src/`; naming the missing home is free here.
function refuse(reason) {
  console.error(`smoke: ${reason} — refusing to judge a home this session does not own`);
  process.exit(2);
}
const smokeSession = process.env["SMOKE_SESSION"] ?? "";
const botHome = process.env["BOT_HOME"] ?? "";
if (botHome === "") refuse("BOT_HOME is unset, so every verb would read the operator's own bot home");
if (smokeSession !== "" && botHome !== join(smokeSession, "home")) refuse(`BOT_HOME is ${botHome}, not the ${join(smokeSession, "home")} that $SMOKE_SESSION names`);
if (!existsSync(botHome)) refuse(`there is no bot home at ${botHome}`);

function spawnBot(args, env) {
  const held = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", ...(env === undefined ? {} : { env }) });
  return { code: held.status ?? -1, out: held.stdout ?? "", err: held.stderr ?? "" };
}

/** One read-only CLI verb against the scratch home the driver exported, with
 * its exit code, its stdout AND its stderr — all three are facts a rung may
 * assert. run.sh reads machine-readable JSON for facts it consumes, so the
 * selected fields remain a contract; ticket 0083 moves its scratch reading to
 * `bot run show`. */
export function bot(...args) {
  return spawnBot(args);
}

/** The same verb with $BOT_HOME taken OUT of the child's environment, so the
 * only thing that can point it at a home is the `--home` flag. Unset rather
 * than merely overridden: left in place, a `--home` that silently did nothing
 * would still agree with the variable. Nothing else moves — `XDG_CACHE_HOME`
 * stays, because `bot run show` names scratch directories out of it — and this
 * validator's own home is untouched, since the refusals above read the
 * environment of THIS process and this hands a copy to a child.
 *
 * The flag goes after the verb, where the CLI takes it: the first word of a
 * command line is the command, so a leading `--home` is read as a verb by that
 * name and refused as one — which is what the first run of it here did. */
export function botElsewhere(home, ...args) {
  const env = { ...process.env };
  delete env["BOT_HOME"];
  return spawnBot([...args, "--home", home], env);
}

/** Columns of one CLI line: the inspection verbs separate fields by two spaces. */
export function columns(line) {
  return line.split(/ {2,}/u);
}

/** Non-empty lines of a file. */
export function lines(path) {
  return readFileSync(path, "utf8").split("\n").filter((line) => line.length > 0);
}

/** A file's text, or "" when the record pointed nowhere — an absent capture is
 * a failed assertion with a name, never a stack trace. */
export function text(path) {
  return existsSync(path) && statSync(path).isFile() ? readFileSync(path, "utf8") : "";
}

export function events(all, event) {
  return all.filter((held) => held.event === event);
}

/** Every session entry Pi wrote, unparseable lines skipped (a killed run's tail). */
export function session(path) {
  const held = [];
  for (const line of lines(path)) {
    try {
      held.push(JSON.parse(line));
    } catch {
      continue;
    }
  }
  return held;
}

/** The message of one session entry, or undefined when the entry is not one. */
export function message(entry) {
  return entry.type === "message" && entry.message !== null && typeof entry.message === "object" ? entry.message : undefined;
}

/** Every tool call an assistant turn made, by call id. */
export function toolCalls(entries) {
  const calls = new Map();
  for (const entry of entries) {
    const held = message(entry);
    if (held?.role !== "assistant" || !Array.isArray(held.content)) continue;
    for (const block of held.content) {
      if (block?.type === "toolCall" && typeof block.id === "string") calls.set(block.id, block);
    }
  }
  return calls;
}

export const runDirectory = process.env["RUN_DIR"] ?? "";
/** The run's own name, which is what every CLI verb takes. */
export const runName = runDirectory === "" ? "" : basename(runDirectory);
export const stdout = text(process.env["STDOUT"] ?? "");
export const exitCode = Number(process.env["EXIT"] ?? "-1");
export const canary = process.env["CANARY"] ?? "";
