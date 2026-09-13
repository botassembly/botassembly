// The in-process CLI call, one copy (ticket 0103). Seven inspection and prune
// test files had each grown their own ~22-line `invoke`: the same `CliBoundary`
// over a FROZEN clock, no model, stdout and stderr collected into arrays, then
// the real `main(argv, boundary)`. Roughly 150 duplicated lines violated
// CHECKLIST 9.
//
// This is `boundary.ts`'s move (0063 item 12) and `cli-boundary.ts`'s (0041/
// 0052) made a third time, and it is a THIRD boundary rather than an addition
// to either: `boundary.ts` spawns `src/cli.ts` as a real child, and
// `cli-boundary.ts` injects a faux PROVIDER so `bot run` can drive a model.
// The verbs here read a home and print — no child, no model — and importing
// them through `cli-boundary.ts` would drag `@earendil-works/pi-ai` into the
// module graph of seven files that never ask a model anything. So the file is
// named for its one export family instead of being a third `*-boundary`.
//
// Nothing behavioural lives here and no assertion moved: every caller keeps a
// one-line alias with its own signature, which is also where the drift between
// the seven copies is now VISIBLE rather than buried twenty lines down.
import { Writable } from "node:stream";
import { join } from "node:path";
import { main, type CliBoundary } from "../src/cli.ts";
import { configuredAuthListRuntime, configuredAuthLogoutRuntime, configuredModelRuntime, configuredProviderCatalog } from "../src/model-runtime.ts";

export interface Invoked { code: number; out: string; err: string }

/** The same call with the bytes UNDECODED, for the caller asserting that two
 *  runs of a verb wrote byte-identical stdout — a `toString()` first would
 *  make that check pass over bytes that are not valid UTF-8. */
export interface InvokedBytes { code: number; out: Buffer; err: Buffer }

/**
 * What actually varied between the seven copies, and nothing else — CHECKLIST 6
 * bans the just-in-case parameter, so each field below is here because a test
 * that exists today needs it.
 */
export interface Where {
  /** `BOT_HOME`. Every caller sets it; it is the home under test. */
  home: string;
  /** `XDG_CACHE_HOME`, the root a run's scratch hangs under. Only the callers
   *  that assert what `bot prune --delete` takes with the run set it; leaving
   *  it unset leaves the variable ABSENT from the environment, as it was. */
  cache?: string;
  /** `XDG_CONFIG_HOME`, which is where bot's own credential file hangs (ADR
   *  0017). Only `bot auth`'s callers set it, and the real `~/.config` is never
   *  a candidate for them, because leaving it unset would leave the derivation
   *  falling back to `$HOME` — which is why every one of them passes it. */
  config?: string;
  /** Pi agent directory for tests that exercise the public auth runtime. */
  agentDir?: string;
  /** Extra environment for the boundary snapshot — the provider API keys the
   *  `bot auth` listing reports as answered by the environment, and nothing
   *  else needs it. */
  env?: NodeJS.ProcessEnv;
  /** Whether stdin is a terminal; `bot auth login` is the only verb that asks,
   *  and it refuses when the answer is no. Defaults to true, as every caller
   *  before this field assumed. */
  tty?: boolean;
  /** Scripted answers for a login, so a witness can walk a login flow with no
   *  terminal and no network. Records nothing itself: the caller's closure is
   *  where the hidden flag and the call order are observed. */
  readLine?: CliBoundary["readLine"];
  /** An awaitable raw stdout seam for fixed-snapshot record-copy tests. */
  rawStdout?: (bytes: Uint8Array) => void | Promise<void>;
  /** The wall clock `main` reads. It reaches this lens through exactly one
   *  line — `inspectPrune`'s `now` (cli.ts) — and is read only when `--age`
   *  gives it a cutoff to subtract from, so for every other verb it is inert.
   *  It is a parameter and not a constant because the copies disagreed about
   *  it (three values across seven files) and at least one test does depend on
   *  it: `bot prune --age 0` prunes exactly the runs older than this instant. */
  now?: string;
  /** A controlled assembly replacement boundary for update recovery tests. */
  afterAssemblyUpdateAside?: () => Promise<void>;
  /** A controlled boundary after locked update selection and before result validation. */
  afterAssemblyUpdateSelection?: () => Promise<void>;
  /** A controlled boundary after replacement publication and before old-tree cleanup. */
  afterAssemblyUpdatePublish?: () => Promise<void>;
}

/** The value four of the seven copies froze the clock at. */
const FROZEN = "2026-08-02T00:00:00.000Z";

export async function invokeCliBytes(argv: string[], where: Where): Promise<InvokedBytes> {
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const clock: CliBoundary["clock"] = {
    milliseconds: () => 0,
    timestamp: () => where.now ?? FROZEN,
    setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
    clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
  };
  const env = {
    BOT_HOME: where.home,
    ...(where.cache === undefined ? {} : { XDG_CACHE_HOME: where.cache }),
    ...(where.config === undefined ? {} : { XDG_CONFIG_HOME: where.config }),
    ...where.env,
  };
  const agentDir = where.agentDir;
  let runtime: ReturnType<typeof configuredModelRuntime> | undefined;
  let authListRuntime: ReturnType<typeof configuredAuthListRuntime> | undefined;
  let authLogoutRuntime: ReturnType<typeof configuredAuthLogoutRuntime> | undefined;
  let catalog: ReturnType<typeof configuredProviderCatalog> | undefined;
  const boundary: CliBoundary = {
    cwd: "/",
    env,
    ...(where.readLine === undefined ? {} : { readLine: where.readLine }),
    rawStdout: () => new Writable({
      write: (bytes: Buffer, _encoding, done) => {
        const written = where.rawStdout === undefined
          ? Promise.resolve(stdout.push(Buffer.from(bytes)))
          : Promise.resolve().then(() => where.rawStdout?.(bytes));
        written.then(() => { done(); }, (reason: unknown) => { done(reason instanceof Error ? reason : new Error("Raw test writer failed.")); });
      },
    }),
    stdinIsTTY: where.tty ?? true,
    stderrIsTTY: false,
    readStdin: () => Promise.resolve(Buffer.alloc(0)),
    stdout: (bytes) => { stdout.push(Buffer.from(bytes)); },
    stderr: (bytes) => { stderr.push(Buffer.from(bytes)); },
    clock,
    ...(agentDir === undefined ? {} : {
      authPath: join(agentDir, "auth.json"),
      modelRuntime: () => { runtime ??= configuredModelRuntime({ agentDir, env, clock }); return runtime; },
      authRuntime: () => { runtime ??= configuredModelRuntime({ agentDir, env, clock }); return runtime; },
      authLogoutRuntime: () => { authLogoutRuntime ??= configuredAuthLogoutRuntime({ agentDir, env, clock }); return authLogoutRuntime; },
      authListRuntime: () => { authListRuntime ??= configuredAuthListRuntime({ agentDir, env, clock }); return authListRuntime; },
      authProvider: async (id: string) => {
        catalog ??= configuredProviderCatalog({ agentDir, env, clock });
        return (await catalog).getProvider(id);
      },
    }),
    ...(where.afterAssemblyUpdateAside === undefined ? {} : { afterAssemblyUpdateAside: where.afterAssemblyUpdateAside }),
    ...(where.afterAssemblyUpdateSelection === undefined ? {} : { afterAssemblyUpdateSelection: where.afterAssemblyUpdateSelection }),
    ...(where.afterAssemblyUpdatePublish === undefined ? {} : { afterAssemblyUpdatePublish: where.afterAssemblyUpdatePublish }),
  };
  const code = await main(argv, boundary);
  return { code, out: Buffer.concat(stdout), err: Buffer.concat(stderr) };
}

export async function invokeCli(argv: string[], where: Where): Promise<Invoked> {
  const held = await invokeCliBytes(argv, where);
  return { code: held.code, out: held.out.toString(), err: held.err.toString() };
}

/** stdout as the lines a listing printed: the terminator leaves a trailing
 *  empty element and no verb prints a blank line, so dropping the empties is
 *  the whole of it. */
function startedFromRunId(id: string, shown: string): string {
  const match = /^(?<date>\d{4}-\d{2}-\d{2})T(?<hour>\d{2})-(?<minute>\d{2})-(?<second>\d{2})-/u.exec(id)?.groups;
  return shown === "-" || match === undefined ? shown : `${match["date"] ?? ""}T${match["hour"] ?? ""}:${match["minute"] ?? ""}:${match["second"] ?? ""}.000Z`;
}

function rawMagnitude(shown: string): string {
  const match = /^(?<value>\d+(?:\.\d+)?)(?: )?(?<unit>[KMGT]?)(?:B)?$/u.exec(shown)?.groups;
  if (match === undefined) return shown;
  const power = ["", "K", "M", "G", "T"].indexOf(match["unit"] ?? "");
  return String(Number(match["value"]) * (1_000 ** power));
}

/** Preserve older tests' semantic row view while human rendering evolves. */
export function printedLines(lines: string[]): string[] {
  const first = lines[0]?.trim().toLowerCase();
  if (first?.split(/\s{2,}/u).join("  ") === "run id  assembly  flow  started  outcome  tokens") {
    return lines.slice(1).map((line) => {
      const [id = "", assembly = "", flow = "", started = "", outcome = "", tokens = ""] = line.trim().split(/\s{2,}/u);
      return [id, assembly, flow, startedFromRunId(id, started), outcome, rawMagnitude(tokens)].join("  ");
    });
  }
  if (first?.split(/\s{2,}/u)[0] === "assemblies" && lines.slice(0, 6).every((line) => line.trim().split(/\s{2,}/u).length === 2)) {
    const facts = lines.slice(0, 6).map((line) => {
      const [label = "", value = ""] = line.trim().split(/\s{2,}/u);
      return `${label} ${rawMagnitude(value)}`;
    });
    const stranded = lines.slice(6).map((line) => {
      const [name = "", bytes = "", detail = ""] = line.trim().split(/\s{2,}/u);
      return [name, rawMagnitude(bytes), detail].join("  ");
    });
    return [facts.join("  "), ...stranded];
  }
  return lines;
}

export function printed(held: Invoked): string[] {
  return printedLines(held.out.split("\n").filter((line) => line.length > 0));
}
