#!/usr/bin/env node
// S3 — progressive disclosure and precedence. One skill name at three scopes
// with three words. The outputs prove which scope won; the session proves the
// losing scopes' words never entered the context at all, and that the winning
// word arrived by a deliberate read rather than up front.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { check, events, exitCode, lines, message, record, runDirectory, session, text, toolCalls, verdict } from "../lib.mjs";

const all = record(runDirectory);
const ends = events(all, "stage_end");
const narrowEnd = ends.find((held) => held.stage === "01-narrow");
const wideEnd = ends.find((held) => held.stage === "02-wide");
const narrowSession = join(runDirectory, "stages", "01-narrow", "1", "session.jsonl");
const wideSession = join(runDirectory, "stages", "02-wide", "1", "session.jsonl");

check("the run exited 0", exitCode === 0, `exit ${String(exitCode)}`);
check("01-narrow sealed 0/success", narrowEnd?.exit === 0 && narrowEnd?.sealed === true, JSON.stringify(narrowEnd));
check("02-wide sealed 0/success", wideEnd?.exit === 0 && wideEnd?.sealed === true, JSON.stringify(wideEnd));

const narrow = text(join(runDirectory, narrowEnd?.output?.path ?? ""));
const wide = text(join(runDirectory, wideEnd?.output?.path ?? ""));
check("the stage-scoped skill won: 01-narrow reported CEDAR", narrow.includes("CEDAR"), JSON.stringify(narrow));
check("01-narrow reported neither AMBER nor BASIL", !narrow.includes("AMBER") && !narrow.includes("BASIL"), JSON.stringify(narrow));
check("the flow-scoped skill won where no stage one existed: 02-wide reported BASIL", wide.includes("BASIL"), JSON.stringify(wide));
check("02-wide reported neither AMBER nor CEDAR", !wide.includes("AMBER") && !wide.includes("CEDAR"), JSON.stringify(wide));

// Information hiding, read from artifacts alone (ticket 0062): session.jsonl
// does not persist the system prompt, so the proof is byte order and absence.
const raw = existsSync(narrowSession) ? lines(narrowSession) : [];
check("01-narrow's session exists", raw.length > 0);
check("AMBER appears nowhere in 01-narrow's session bytes", !raw.some((line) => line.includes("AMBER")));
check("BASIL appears nowhere in 01-narrow's session bytes", !raw.some((line) => line.includes("BASIL")));
check("AMBER appears nowhere in 02-wide's session bytes", existsSync(wideSession) && !lines(wideSession).some((line) => line.includes("AMBER")));

const entries = existsSync(narrowSession) ? session(narrowSession) : [];
const calls = toolCalls(entries);
const first = entries.find((entry) => JSON.stringify(entry).includes("CEDAR"));
const held = first === undefined ? undefined : message(first);
const origin = held?.toolCallId === undefined ? undefined : calls.get(held.toolCallId);
const argued = origin === undefined ? "" : JSON.stringify(origin.arguments);

check("CEDAR's first appearance in the session is inside a tool result", held?.role === "toolResult", JSON.stringify(held?.role));
check("that tool result answers a call the session recorded", origin !== undefined, JSON.stringify(held?.toolCallId));
check("that call names a path under the passphrase skill", /(\$SKILLS|skills)\/passphrase/u.test(argued), argued);
check("the word therefore entered the context by a deliberate read, not before it", held?.role === "toolResult" && /(\$SKILLS|skills)\/passphrase/u.test(argued));

verdict();
