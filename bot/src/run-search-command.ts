import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, open, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { jsonObject } from "./check.ts";
import { RUN_SEARCH_CONTRACT } from "./cli-contract.ts";
import { bytewise, errorCode, mapping } from "./model.ts";
import { resolveHome } from "./invocation.ts";
import { inertText, newCommandFailure, type CommandResult } from "./new-command-result.ts";
import type { CliFailure, ErrorCause } from "./run-list-query.ts";
import type { ErrorCode } from "./spine.ts";
import type { DriverClock } from "./process.ts";

interface Boundary { cwd: string; env: NodeJS.ProcessEnv; stdout(bytes: string | Uint8Array): void; stderr(bytes: string | Uint8Array): void; signal?: AbortSignal; clock: DriverClock }
interface Request { query: string; limit: number; after?: string; home: string; json: boolean }
interface Hit { run: string; stage: string | null; repeat: number | null; retry: number | null; file: string; line: number; text: string; omittedBytes: number }
interface RawHit { file: string; line: number; bytes: Buffer }
interface Tool { name: "rg" | "grep"; version: string }
interface Cursor { v: 1; h: string; q: string; f: string; l: number }
interface GroupObservation { exists: boolean; error?: Error }
export interface RunSearchDependencies { spawn?: typeof spawn; signalGroup?: (pid: number, signal: NodeJS.Signals | 0) => GroupObservation }
interface ParseState { json: boolean; limit: number; after?: string; home?: string; query?: string }

function fault(code: ErrorCode, cause: ErrorCause, message: string, exit: 1 | 2 | 3 | 4 | 5, details: Record<string, unknown> = {}): CliFailure {
  return { code, cause, message, retryable: exit === 4, details, exit };
}
function request(cause: ErrorCause, message: string): CliFailure { return fault("request-invalid", cause, message, 2); }
function emit(boundary: Boundary, result: CommandResult, json: boolean): number {
  try { if (result.stdout.length > 0) boundary.stdout(result.stdout); }
  catch {
    const failed = newCommandFailure("run.search", fault("dependency-failed", "output-error", "Run search could not write its result.", 4), json);
    boundary.stderr(failed.stderr); return failed.exit;
  }
  if (result.stderr.length > 0) boundary.stderr(result.stderr);
  return result.exit;
}

function valuedOption(word: string, value: string, state: ParseState): CliFailure | undefined {
  if (word === "--limit") {
    if (!/^[0-9]+$/u.test(value) || Number(value) < 1 || Number(value) > RUN_SEARCH_CONTRACT.pageMaximum) return request("limit-invalid", "Run search limit must be from 1 through 200.");
    state.limit = Number(value);
  } else if (word === "--after") state.after = value;
  else state.home = value;
  return undefined;
}

function finishRequest(state: ParseState, cwd: string, env: NodeJS.ProcessEnv): Request | CliFailure {
  const query = state.query;
  if (query === undefined) return request("value-missing", "Run search requires one query.");
  const size = Buffer.byteLength(query);
  if (size === 0) return request("value-empty", "Run search query must not be empty.");
  if (size > RUN_SEARCH_CONTRACT.queryBytes) return request("value-oversized", "Run search query exceeds 4,096 UTF-8 bytes.");
  if (query.includes(String.fromCodePoint(0)) || /[\r\n]/u.test(query)) return request("argument-invalid", "Run search query must not contain NUL, CR, or LF.");
  if (state.after !== undefined && Buffer.byteLength(state.after) > RUN_SEARCH_CONTRACT.cursorEncodedBytes) return fault("cursor-invalid", "cursor-limit", "The run search cursor exceeds its encoded bound.", 2);
  return { query, limit: state.limit, ...(state.after === undefined ? {} : { after: state.after }), home: resolveHome(cwd, state.home, env), json: state.json };
}

function parse(args: readonly string[], cwd: string, env: NodeJS.ProcessEnv): Request | CliFailure {
  const state: ParseState = { json: false, limit: RUN_SEARCH_CONTRACT.pageDefault };
  let marker = false;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index] ?? "";
    if (marker) {
      if (word === "--") return request("option-repeated", "Run search accepts the option marker once.");
      if (state.query !== undefined) return request("argument-extra", "Run search accepts exactly one query.");
      state.query = word; continue;
    }
    if (state.query !== undefined) return request("argument-extra", "Run search accepts exactly one query.");
    if (word === "--") {
      if (seen.has("--")) return request("option-repeated", "Run search accepts the option marker once.");
      seen.add("--"); marker = true; continue;
    }
    if (word === "--json" || word === "-j") {
      if (seen.has("json")) return request("option-repeated", "Run search accepts one JSON mode flag.");
      seen.add("json"); state.json = true; continue;
    }
    if (["--limit", "--after", "--home"].includes(word)) {
      if (seen.has(word)) return request("option-repeated", `Run search accepts ${word} once.`);
      seen.add(word); const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) return request("value-missing", `Run search requires a value after ${word}.`);
      index += 1;
      const failed = valuedOption(word, value, state); if (failed !== undefined) return failed;
      continue;
    }
    if (word.startsWith("-")) return request("argument-unknown", `Run search does not accept ${inertText(word, 256).text}.`);
    state.query = word;
  }
  return finishRequest(state, cwd, env);
}

function validName(raw: Buffer): string | undefined {
  const value = raw.toString("utf8");
  return Buffer.from(value).equals(raw) && !/[\r\n]/u.test(value) ? value : undefined;
}

async function candidates(home: string): Promise<string[] | CliFailure> {
  try {
    const homeStat = await stat(home).catch((reason: unknown) => errorCode(reason) === "ENOENT" ? undefined : Promise.reject(reason instanceof Error ? reason : new Error("Home inspection failed.", { cause: reason })));
    if (homeStat === undefined) return fault("home-not-found", "home-missing", "The Bot home does not exist.", 1);
    if (!homeStat.isDirectory()) return fault("home-invalid", "home-invalid", "The Bot home is not a directory.", 1);
    const runs = Buffer.concat([Buffer.from(home), Buffer.from("/runs")]);
    const runsStat = await lstat(runs).catch((reason: unknown) => errorCode(reason) === "ENOENT" ? undefined : Promise.reject(reason instanceof Error ? reason : new Error("Runs inspection failed.", { cause: reason })));
    if (runsStat === undefined) return [];
    if (!runsStat.isDirectory() || runsStat.isSymbolicLink()) return fault("dependency-failed", "runs-invalid", "The runs entry is not a directory.", 4);
    const found: string[] = [];
    const walk = async (absolute: Buffer, relative: Buffer, root: boolean): Promise<CliFailure | undefined> => {
      let names: Buffer[];
      try { names = await readdir(absolute, { encoding: "buffer" }); }
      catch { return fault("dependency-failed", root ? "runs-unavailable" : "filesystem-error", "The retained runs could not be read.", 4); }
      names.sort((left, right) => Buffer.compare(left, right));
      for (const name of names) {
        const decoded = validName(name);
        if (decoded === undefined) return fault("integrity-failed", "source-invalid", "A retained path cannot use the portable search protocol.", 5);
        if (root && (decoded.endsWith(".lock"))) continue;
        const path = Buffer.concat([absolute, Buffer.from("/"), name]);
        const rel = relative.length === 0 ? name : Buffer.concat([relative, Buffer.from("/"), name]);
        let held;
        try { held = await lstat(path); } catch { return fault("dependency-failed", "filesystem-error", "A retained path could not be examined.", 4); }
        if (held.isSymbolicLink()) continue;
        if (held.isDirectory()) {
          if (root || relative.length > 0) { const failed = await walk(path, rel, false); if (failed !== undefined) return failed; }
        } else if (held.isFile() && (decoded === "record.jsonl" || decoded === "session.jsonl") && relative.length > 0) found.push(rel.toString("utf8"));
      }
      return undefined;
    };
    const failed = await walk(runs, Buffer.alloc(0), true);
    if (failed !== undefined) return failed;
    found.sort(bytewise);
    const bytes = found.reduce((total, name) => total + Buffer.byteLength(name) + 1, 0);
    if (found.length > RUN_SEARCH_CONTRACT.candidates || bytes > RUN_SEARCH_CONTRACT.argumentBytes) return fault("integrity-failed", "result-oversized", "The run search candidate set exceeds its bound.", 5);
    return found;
  } catch { return fault("dependency-failed", "filesystem-error", "The retained runs could not be enumerated.", 4); }
}

function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function decodeCursor(value: string, home: string, query: string, files: readonly string[]): Cursor | CliFailure {
  try {
    if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("encoding");
    const raw = Buffer.from(value, "base64url");
    if (raw.length > RUN_SEARCH_CONTRACT.cursorDecodedBytes) return fault("cursor-invalid", "cursor-limit", "The run search cursor exceeds its decoded bound.", 2);
    const held: unknown = JSON.parse(raw.toString("utf8"));
    if (!mapping(held) || held["v"] !== 1 || typeof held["h"] !== "string" || typeof held["q"] !== "string" || typeof held["f"] !== "string" || !Number.isSafeInteger(held["l"]) || Number(held["l"]) < 1) throw new Error("shape");
    const cursor: Cursor = { v: 1, h: held["h"], q: held["q"], f: held["f"], l: Number(held["l"]) };
    if (cursor.h !== hash(home) || cursor.q !== hash(query)) return fault("cursor-conflict", "cursor-selection", "The run search cursor selects another home or query.", 3);
    if (!files.includes(cursor.f)) return fault("cursor-conflict", "cursor-position", "The run search cursor position no longer exists.", 3);
    return cursor;
  } catch { return fault("cursor-invalid", "cursor-malformed", "The run search cursor is malformed.", 2); }
}
function encodeCursor(home: string, query: string, hit: RawHit): string {
  return Buffer.from(jsonObject({ v: 1, h: hash(home), q: hash(query), f: hit.file, l: hit.line } satisfies Cursor)).toString("base64url");
}

async function cursorLineExists(path: string, line: number): Promise<boolean> {
  const file = await open(path, "r");
  try {
    const buffer = Buffer.allocUnsafe(65_536); let count = 0, bytes = 0, last = -1;
    let complete = false;
    while (!complete) {
      const read = await file.read(buffer, 0, buffer.length, null); complete = read.bytesRead === 0; if (complete) continue; bytes += read.bytesRead; last = buffer[read.bytesRead - 1] ?? -1;
      for (let index = 0; index < read.bytesRead; index += 1) if (buffer[index] === 10 && ++count >= line) return true;
    }
    return count + (bytes > 0 && last !== 10 ? 1 : 0) >= line;
  } finally { await file.close(); }
}

function groupSignal(pid: number, signal: NodeJS.Signals | 0): GroupObservation {
  try { process.kill(-pid, signal); return { exists: true }; }
  catch (reason: unknown) {
    if (errorCode(reason) === "ESRCH") return { exists: false };
    return { exists: true, error: reason instanceof Error ? reason : new Error("Process-group signal failed.", { cause: reason }) };
  }
}
function processSeams(dependencies: RunSearchDependencies): { spawnChild: typeof spawn; signalGroup: typeof groupSignal } {
  return { spawnChild: dependencies.spawn ?? spawn, signalGroup: dependencies.signalGroup ?? groupSignal };
}

type StopReason = "page" | "timeout" | "abort" | "stream" | "pipe" | "signal";
async function execute(name: string, args: string[], cwd: string, deadline: number, maximumBytes: number, env: NodeJS.ProcessEnv, clock: DriverClock, spawnChild: typeof spawn, signalGroup: typeof groupSignal, abort?: AbortSignal, onChunk?: (chunk: Buffer) => boolean): Promise<{ out: Buffer; err: Buffer; code: number; signal: NodeJS.Signals | null; reason?: StopReason }> {
  return await new Promise((accept, reject) => {
    let child: ChildProcess;
    try { child = spawnChild(name, args, { cwd, detached: true, env: { PATH: env["PATH"] ?? "", LANG: "C", LC_ALL: "C" }, stdio: ["ignore", "pipe", "pipe"] }); }
    catch (reason: unknown) { reject(reason instanceof Error ? reason : new Error("Search process could not start.", { cause: reason })); return; }
    const output: Buffer[] = [], errors: Buffer[] = []; let total = 0, reason: StopReason | undefined, settled = false, terminationReady = false;
    let exited = false, closed = false, stdoutEof = false, stderrEof = false, stdoutClosed = false, stderrClosed = false;
    let exitCode: number | null = null, exitSignal: NodeJS.Signals | null = null, closeCode: number | null = null, closeSignal: NodeJS.Signals | null = null;
    const remaining = Math.max(0, deadline - clock.milliseconds());
    let killer: unknown, cleanup: unknown, termProblem: Error | undefined;
    const signalFailure = (phase: "term" | "kill", problem: Error) => { const raw = errorCode(problem) ?? "UNKNOWN", code = /^[A-Z0-9_]{1,32}$/u.test(raw) ? raw : "UNKNOWN"; return new Error(["signal-failed", phase, code, exited, closed, stdoutEof, stderrEof, stdoutClosed, stderrClosed, reason ?? "none"].join("|")); };
    const fail = (problem: Error) => {
      if (settled) return; settled = true; clock.clearTimeout(timer); if (killer !== undefined) clock.clearTimeout(killer); if (cleanup !== undefined) clock.clearTimeout(cleanup); abort?.removeEventListener("abort", aborted);
      child.stdout?.destroy(); child.stderr?.destroy(); reject(problem);
    };
    const complete = () => {
      if (settled) return;
      const direct = exited && closed && exitCode === closeCode && exitSignal === closeSignal;
      const pipes = reason === undefined ? stdoutEof && stderrEof && stdoutClosed && stderrClosed : stdoutClosed && stderrClosed;
      if (!direct || !pipes || (reason !== undefined && !terminationReady)) return;
      settled = true; clock.clearTimeout(timer); if (killer !== undefined) clock.clearTimeout(killer); if (cleanup !== undefined) clock.clearTimeout(cleanup); abort?.removeEventListener("abort", aborted);
      accept({ out: Buffer.concat(output), err: Buffer.concat(errors), code: closeCode ?? -1, signal: closeSignal, ...(reason === undefined ? {} : { reason }) });
    };
    const terminate = (why: StopReason) => {
      if (reason !== undefined) return; reason = why;
      if (child.pid !== undefined) { const stopped = signalGroup(child.pid, "SIGTERM"); if (stopped.error !== undefined) { reason = "signal"; termProblem = stopped.error; } }
      killer = clock.setTimeout(() => {
        const killed = child.pid === undefined ? { exists: false } : signalGroup(child.pid, "SIGKILL"); if (killed.error !== undefined) { fail(signalFailure("kill", killed.error)); return; } if (termProblem !== undefined) { fail(signalFailure("term", termProblem)); return; }
        child.stdout?.destroy(); child.stderr?.destroy(); terminationReady = true; complete(); if (settled) return;
        cleanup = clock.setTimeout(() => { complete(); if (!settled) fail(new Error("close-failed")); }, RUN_SEARCH_CONTRACT.cleanupMilliseconds);
      }, RUN_SEARCH_CONTRACT.graceMilliseconds);
    };
    const timer = clock.setTimeout(() => { terminate("timeout"); }, remaining);
    const aborted = () => { terminate("abort"); }; abort?.addEventListener("abort", aborted, { once: true });
    if (abort?.aborted === true) aborted();
    const take = (target: Buffer[], chunk: Buffer, parse: boolean) => {
      if (reason !== undefined) return; total += chunk.length;
      if (total > maximumBytes) { terminate("stream"); return; }
      target.push(chunk);
      if (parse && onChunk?.(chunk) === true) terminate("page");
    };
    child.stdout?.on("data", (chunk: Buffer) => { take(output, Buffer.from(chunk), true); });
    child.stderr?.on("data", (chunk: Buffer) => { take(errors, Buffer.from(chunk), false); });
    child.stdout?.once("end", () => { stdoutEof = true; complete(); });
    child.stderr?.once("end", () => { stderrEof = true; complete(); });
    child.stdout?.once("close", () => { stdoutClosed = true; complete(); });
    child.stderr?.once("close", () => { stderrClosed = true; complete(); });
    child.stdout?.once("error", () => { terminate("pipe"); });
    child.stderr?.once("error", () => { terminate("pipe"); });
    child.once("error", (problem) => { if (child.pid === undefined) fail(problem); else terminate("pipe"); });
    child.once("exit", (code, signal) => { exited = true; exitCode = code; exitSignal = signal; complete(); });
    child.once("close", (code, signal) => {
      closed = true; closeCode = code; closeSignal = signal;
      if (exited && (code !== exitCode || signal !== exitSignal)) { fail(new Error("close-failed")); return; }
      complete();
    });
  });
}

async function selectTool(runs: string, deadline: number, env: NodeJS.ProcessEnv, clock: DriverClock, spawnChild: typeof spawn, signalGroup: typeof groupSignal, signal?: AbortSignal): Promise<Tool | CliFailure> {
  for (const name of ["rg", "grep"] as const) {
    try {
      const held = await execute(name, ["--version"], runs, deadline, RUN_SEARCH_CONTRACT.probeBytes, env, clock, spawnChild, signalGroup, signal);
      if (held.reason === "timeout") return fault("dependency-failed", "timeout", `${name} version probing timed out.`, 4);
      if (held.reason !== undefined || held.code !== 0) return fault("dependency-failed", held.reason === "stream" ? "result-too-large" : held.reason === "pipe" || held.reason === "signal" ? "close-failed" : "dependency-failed", `${name} version probing failed.`, 4);
      const version = Buffer.concat([held.out, held.err]).toString("utf8").split(/\r?\n/u).find((line) => line.length > 0);
      if (version === undefined) return fault("dependency-failed", "dependency-failed", `${name} returned no version.`, 4);
      return { name, version: Buffer.from(version).subarray(0, 256).toString("utf8") };
    } catch (reason) {
      if (errorCode(reason) === "ENOENT") continue;
      return fault("dependency-failed", settlementCause(reason), `${name} version probing failed.`, 4, settlementDetails(reason));
    }
  }
  return fault("dependency-failed", "dependency-failed", "Run search requires rg or grep on PATH.", 4);
}

function rgPath(value: unknown): string | undefined {
  if (!mapping(value)) return undefined;
  const path = typeof value["text"] === "string" ? value["text"] : typeof value["bytes"] === "string" ? Buffer.from(value["bytes"], "base64").toString("utf8") : undefined;
  return path?.replace(/^\.\//u, "");
}
function rgElapsed(value: unknown): boolean {
  return mapping(value) && Number.isSafeInteger(value["secs"]) && Number(value["secs"]) >= 0 && Number.isSafeInteger(value["nanos"]) && Number(value["nanos"]) >= 0 && Number(value["nanos"]) < 1_000_000_000 && typeof value["human"] === "string";
}
function rgStats(value: unknown): boolean {
  return mapping(value) && rgElapsed(value["elapsed"]) && ["searches", "searches_with_match", "bytes_searched", "bytes_printed", "matched_lines", "matches"].every((key) => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0);
}
function validRgNotice(type: string, data: unknown): boolean {
  if (!mapping(data)) return false;
  if (type === "begin") return rgPath(data["path"]) !== undefined;
  if (type === "end") return rgPath(data["path"]) !== undefined && (data["binary_offset"] === null || Number.isSafeInteger(data["binary_offset"]) && Number(data["binary_offset"]) >= 0) && rgStats(data["stats"]);
  return type === "summary" && rgElapsed(data["elapsed_total"]) && rgStats(data["stats"]);
}
function parseRg(line: Buffer): RawHit | string | undefined {
  const value: unknown = JSON.parse(line.toString("utf8"));
  if (!mapping(value) || typeof value["type"] !== "string" || !["begin", "match", "context", "end", "summary"].includes(value["type"])) throw new Error("unknown ripgrep event");
  const data = value["data"];
  if (["begin", "end", "summary"].includes(value["type"])) { if (!validRgNotice(value["type"], data)) throw new Error("malformed event"); return value["type"] === "summary" || !mapping(data) ? undefined : rgPath(data["path"]); }
  if (value["type"] === "context") throw new Error("unexpected context");
  if (!mapping(data) || !mapping(data["path"]) || !rgPath(data["path"]) || !mapping(data["lines"]) || !Number.isSafeInteger(data["line_number"]) || Number(data["line_number"]) < 1) throw new Error("malformed line");
  const path = rgPath(data["path"]);
  const bytes = typeof data["lines"]["text"] === "string" ? Buffer.from(data["lines"]["text"]) : typeof data["lines"]["bytes"] === "string" ? Buffer.from(data["lines"]["bytes"], "base64") : undefined;
  if (path === undefined || bytes === undefined) throw new Error("malformed match");
  const terminator = bytes.at(-1) === 10 ? (bytes.at(-2) === 13 ? 2 : 1) : 0;
  return { file: path, line: Number(data["line_number"]), bytes: bytes.subarray(0, bytes.length - terminator) };
}

function parseGrep(line: Buffer): RawHit {
  const nul = line.indexOf(0), colon = line.indexOf(58, nul + 1);
  if (nul < 1 || colon < nul + 2) throw new Error("malformed grep output");
  const number = line.subarray(nul + 1, colon).toString("ascii");
  if (!/^[1-9][0-9]*$/u.test(number)) throw new Error("malformed grep line");
  const lineNumber = Number(number); if (!Number.isSafeInteger(lineNumber)) throw new Error("malformed grep line");
  const bytes = line.subarray(colon + 1);
  return { file: line.subarray(0, nul).toString("utf8").replace(/^\.\//u, ""), line: lineNumber, bytes: bytes.at(-1) === 13 ? bytes.subarray(0, -1) : bytes };
}

function enriched(raw: RawHit): Hit {
  const segments = raw.file.split("/"); let stage: string | null = null, repeat: number | null = null, retry: number | null = null;
  const match = raw.file.match(/^.+\/stages\/(.+)\/([1-9][0-9]*)\/session\.jsonl$/u);
  if (match !== null) { stage = match[1] ?? null; repeat = Number(match[2]); }
  else if (raw.file.endsWith("record.jsonl")) {
    try { const value: unknown = JSON.parse(raw.bytes.toString("utf8"));
      if (mapping(value)) {
        stage = typeof value["stage"] === "string" && value["stage"].length > 0 ? value["stage"] : null;
        repeat = Number.isSafeInteger(value["repeat"]) && Number(value["repeat"]) > 0 ? Number(value["repeat"]) : null;
        retry = Number.isSafeInteger(value["retry"]) && Number(value["retry"]) > 0 ? Number(value["retry"]) : null;
      }
    } catch { /* invalid event lines remain searchable */ }
  }
  const decoded = Buffer.from(raw.bytes.toString("utf8")); let end = Math.min(decoded.length, RUN_SEARCH_CONTRACT.markdownCellBytes);
  while (end > 0 && (decoded[end] ?? 0) >= 0x80 && (decoded[end] ?? 0) < 0xc0) end -= 1;
  return { run: segments[0] ?? "", stage, repeat, retry, file: raw.file, line: raw.line, text: decoded.subarray(0, end).toString("utf8"), omittedBytes: decoded.length - end };
}

function render(requested: Request, tool: Tool, raw: RawHit[], count: number): CommandResult {
  const more = raw.length > requested.limit, shown = raw.slice(0, requested.limit), hits = shown.map(enriched), last = shown.at(-1);
  const next = more && last !== undefined ? encodeCursor(requested.home, requested.query, last) : null;
  const document = { schemaVersion: 1, kind: "bot.run.search", data: { query: requested.query, tool, hits }, page: { limit: requested.limit, next, complete: !more }, summary: { candidateFiles: count, returned: hits.length } };
  const heading = `# Run search\n\nTool: ${inertText(tool.name, 32).text} ${inertText(tool.version, 256).text}\n\n`;
  const table = "| Run | Stage | Repeat | Retry | File | Line | Text | Omitted bytes |\n| --- | --- | ---: | ---: | --- | ---: | --- | ---: |\n" + hits.map((hit) => `| ${inertText(hit.run).text} | ${hit.stage === null ? "-" : inertText(hit.stage).text} | ${String(hit.repeat ?? "-")} | ${String(hit.retry ?? "-")} | ${inertText(hit.file).text} | ${String(hit.line)} | ${inertText(hit.text).text} | ${String(hit.omittedBytes)} |`).join("\n") + "\n";
  const stdout = Buffer.from(requested.json ? `${jsonObject(document)}\n` : `${heading}${table}`);
  if (stdout.length >= RUN_SEARCH_CONTRACT.resultBytesExclusive) return newCommandFailure("run.search", fault("integrity-failed", "result-oversized", "The run search result exceeds its output bound.", 5), requested.json);
  const stderr = !requested.json && next !== null ? Buffer.from(`More matches remain. Continue with --after ${next}.\n`) : Buffer.alloc(0);
  return { exit: 0, stdout, stderr };
}

function searchFailure(result: { reason?: StopReason; err: Buffer; code: number }, protocolFailure: "size" | "protocol" | undefined, hitCount: number): CliFailure | undefined {
  const stoppedBadly = result.reason !== undefined && result.reason !== "page";
  const exitedBadly = result.reason === undefined && result.code !== 0 && !(result.code === 1 && hitCount === 0);
  if (!stoppedBadly && protocolFailure === undefined && result.err.length === 0 && !exitedBadly) return undefined;
  const cause = result.reason === "timeout" ? "timeout" : result.reason === "stream" || protocolFailure === "size" ? "result-too-large" : result.reason === "signal" ? "close-failed" : "dependency-failed", message = result.reason === "timeout" ? "Run search timed out." : result.reason === "signal" ? "The search tool process group could not be signaled." : "The search tool returned an invalid result.";
  return fault("dependency-failed", cause, message, 4);
}
function settlementSignal(reason: unknown): RegExpExecArray | null { return reason instanceof Error ? /^signal-failed\|(term|kill)\|([A-Z0-9_]{1,32})\|(true|false)\|(true|false)\|(true|false)\|(true|false)\|(true|false)\|(true|false)\|(page|timeout|abort|stream|pipe|signal)$/u.exec(reason.message) : null; }
function settlementCause(reason: unknown): ErrorCause { return reason instanceof Error && (reason.message === "close-failed" || settlementSignal(reason) !== null) ? "close-failed" : "dependency-failed"; }
function settlementMessage(reason: unknown): string { return settlementSignal(reason) !== null ? "The search tool process group could not be signaled." : "The search tool could not settle safely."; }
function settlementDetails(reason: unknown): Record<string, unknown> { const held = settlementSignal(reason); return held === null ? {} : { signal: { phase: held[1], code: held[2], exited: held[3] === "true", closed: held[4] === "true", stdoutEof: held[5] === "true", stderrEof: held[6] === "true", stdoutClosed: held[7] === "true", stderrClosed: held[8] === "true", stopReason: held[9] } }; }

export async function runSearchCommand(args: string[], boundary: Boundary, dependencies: RunSearchDependencies = {}): Promise<number> {
  const parsed = parse(args, boundary.cwd, boundary.env), json = args.includes("--json") || args.includes("-j");
  if ("code" in parsed) return emit(boundary, newCommandFailure("run.search", parsed, json), json);
  const files = await candidates(parsed.home);
  if (!Array.isArray(files)) return emit(boundary, newCommandFailure("run.search", files, parsed.json), parsed.json);
  let cursor: Cursor | undefined;
  if (parsed.after !== undefined) { const held = decodeCursor(parsed.after, parsed.home, parsed.query, files); if ("code" in held) return emit(boundary, newCommandFailure("run.search", held, parsed.json), parsed.json); cursor = held; }
  const deadline = boundary.clock.milliseconds() + RUN_SEARCH_CONTRACT.operationMilliseconds, runs = resolve(parsed.home, "runs");
  const { spawnChild, signalGroup } = processSeams(dependencies);
  const tool = await selectTool(files.length === 0 ? parsed.home : runs, deadline, boundary.env, boundary.clock, spawnChild, signalGroup, boundary.signal);
  if ("code" in tool) return emit(boundary, newCommandFailure("run.search", tool, parsed.json), parsed.json);
  if (cursor !== undefined) {
    try { if (!await cursorLineExists(resolve(runs, cursor.f), cursor.l)) return emit(boundary, newCommandFailure("run.search", fault("cursor-conflict", "cursor-position", "The run search cursor position no longer exists.", 3), parsed.json), parsed.json); }
    catch { return emit(boundary, newCommandFailure("run.search", fault("cursor-conflict", "cursor-position", "The run search cursor position no longer exists.", 3), parsed.json), parsed.json); }
  }
  if (files.length === 0) return emit(boundary, render(parsed, tool, [], 0), parsed.json);
  const selected = cursor === undefined ? files : files.slice(files.indexOf(cursor.f));
  const hits: RawHit[] = []; let pending = Buffer.alloc(0), protocolFailure: "size" | "protocol" | undefined, lastFile = -1, lastLine = 0;
  const consume = (chunk: Buffer): boolean => {
    pending = Buffer.concat([pending, chunk]);
    let complete = false;
    while (!complete) {
      const newline = pending.indexOf(10); complete = newline < 0; if (complete) continue;
      const line = pending.subarray(0, newline); pending = pending.subarray(newline + 1);
      if (line.length > RUN_SEARCH_CONTRACT.protocolLineBytes) { protocolFailure = "size"; return true; }
      try {
        const hit = tool.name === "rg" ? parseRg(line) : parseGrep(line);
        if (typeof hit === "string") { if (!files.includes(hit)) throw new Error("unknown lifecycle path"); continue; }
        if (hit === undefined) continue;
        const ordinal = files.indexOf(hit.file);
        if (ordinal < 0 || ordinal < lastFile || (ordinal === lastFile && hit.line <= lastLine)) throw new Error("order");
        lastFile = ordinal; lastLine = hit.line;
        if (cursor !== undefined && (ordinal < files.indexOf(cursor.f) || (hit.file === cursor.f && hit.line <= cursor.l))) continue;
        hits.push(hit); if (hits.length > parsed.limit) return true;
      } catch { protocolFailure = "protocol"; return true; }
    }
    if (pending.length > RUN_SEARCH_CONTRACT.protocolLineBytes) { protocolFailure = "size"; return true; }
    return false;
  };
  const invocation = tool.name === "rg"
    ? ["--threads", "1", "--fixed-strings", "--json", "--no-config", "--text", "--with-filename", "--line-number", "--", parsed.query, ...selected]
    : ["--null", "-a", "-H", "-n", "-F", "--", parsed.query, ...selected];
  let result;
  try { result = await execute(tool.name, invocation, runs, deadline, RUN_SEARCH_CONTRACT.streamBytes, boundary.env, boundary.clock, spawnChild, signalGroup, boundary.signal, consume); }
  catch (reason) { return emit(boundary, newCommandFailure("run.search", fault("dependency-failed", settlementCause(reason), settlementMessage(reason), 4, settlementDetails(reason)), parsed.json), parsed.json); }
  if (pending.length > 0 && result.reason !== "page") protocolFailure = "protocol";
  const failed = searchFailure(result, protocolFailure, hits.length);
  if (failed !== undefined) return emit(boundary, newCommandFailure("run.search", failed, parsed.json), parsed.json);
  return emit(boundary, render(parsed, tool, hits, files.length), parsed.json);
}
