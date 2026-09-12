#!/usr/bin/env node
// S10 — the tool as a user actually holds it (ticket 0141). ~1-2k tokens.
//
// Every rung above this one runs a fixture by explicit path with the request in
// argv, which is the one shape a person never uses. This rung is the other one,
// end to end: `bot assembly install` puts the fixture in the home, `bot
// assembly list` lists it, `bot run start <name>/<flow>` resolves that NAME with the
// request arriving on STDIN, and `bot assembly remove` takes it out again while
// the run's record stays exactly where it was.
//
// Three legs had never met a live run before this: name resolution out of the
// home (invocation.ts `targetPath`), the stdin request (cli.ts `requestFor`),
// and the install-copy (ADR 0016, and run.ts's `assemblyName`).
//
// THE PREMISE THE TICKET GOT WRONG, corrected here and asserted in its corrected
// form: the record does not hold a PATH to the home's copy. `run.ts`'s
// `assemblyName` writes the name RELATIVE to `<home>/assemblies` when the target
// lives there, so a run of an installed assembly records the bare registered
// name — `lifecycle` — while the path-run rungs above record an absolute path.
// The distinction is exactly the one the ticket wanted, and it is stronger: the
// recorded name is meaningless outside a home, and `bot assembly update` matches
// live runs on it (inspection.ts `liveAssemblies`).
//
// run.sh does the writing verbs and leaves their output in $LOGS; this file
// reads those captures and then asks the reading verbs itself, AFTER the
// removal, which is where "the record survives" is actually decided.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bot, canary, check, columns, events, exitCode, record, runDirectory, runName, stdout, text, verdict } from "../lib.mjs";
import { parseRunShow } from "../run-show-facts.mjs";

const NAME = "lifecycle";
const FLOW = "answer";
const FIXTURE = fileURLToPath(new URL("./assembly", import.meta.url));
const logs = process.env["LOGS"] ?? "";
const captured = (label) => text(join(logs, `${label}.out`));
const said = (label) => text(join(logs, `${label}.err`));
const closed = (label) => text(join(logs, `${label}.exit`)).trim();
const all = record(runDirectory);
const start = all[0];
const end = all.at(-1);
const ends = events(all, "stage_end");
const sealed = ends.at(-1);

// ---- what a person types first.
check("bot assembly install exited 0", closed("install") === "0", `exit ${closed("install")} ${said("install")}`);
check("install said what it installed and where from", captured("install").includes(`${NAME}  installed  from `) && captured("install").includes(FIXTURE), JSON.stringify(captured("install")));
check("bot assembly list exited 0 and listed it", closed("list") === "0" && captured("list").trim() !== "", `exit ${closed("list")} ${said("list")}`);
const listed = captured("list").split("\n").filter((line) => line.length > 0).map(columns);
check("the listing holds exactly this one assembly, installed with its provenance", listed.length === 1 && listed[0]?.[0] === NAME && listed[0]?.[1] === "installed" && String(listed[0]?.[2]).startsWith(`from ${FIXTURE}`), JSON.stringify(listed));
// `bot assembly check` resolves a target exactly as `bot run start` does and calls no model, so
// it is what proves the bare name reached an assembly — before the run spends
// anything on the same resolution, and again after the removal below.
check("bot assembly check resolved the bare name through the home, before the run", closed("check-held") === "0", `exit ${closed("check-held")} ${said("check-held")}`);

// ---- the run, by name, with the request on stdin.
check("the run exited 0", exitCode === 0, `exit ${String(exitCode)}`);
check("the record closes with run_end 0/success", end?.event === "run_end" && end.exit === 0 && end.cause === "success", JSON.stringify(end));
check("the record says the request arrived VIA STDIN", start?.request?.via === "stdin", JSON.stringify(start?.request));
check("the request kept beside the run is the canary, byte for byte", text(join(runDirectory, String(start?.request?.path ?? ""))).trim() === canary, JSON.stringify(text(join(runDirectory, String(start?.request?.path ?? "")))));
check("the record names the flow that was asked for", start?.flow === FLOW, JSON.stringify(start?.flow));

// ---- run-from-own-copy, in the record's own terms.
check("the record names the assembly by its REGISTERED NAME, not by a path", start?.assembly === NAME, JSON.stringify(start?.assembly));
check("that name is nothing the fixture could have supplied", !String(start?.assembly).includes("/") && !String(start?.assembly).includes("smoke"), JSON.stringify(start?.assembly));
const copy = join(runDirectory, "assembly", "ASSEMBLY.md");
check("the run kept its own copy of the assembly", existsSync(copy), copy);
check("that copy is the bytes the fixture holds", existsSync(copy) && readFileSync(copy, "utf8") === readFileSync(join(FIXTURE, "ASSEMBLY.md"), "utf8"));
// The home's copy carries a `.bot-source` that install wrote (management.md) and
// the fixture does not. The run's capture holds neither, because a dot entry is
// outside the assembly and outside the hash (invariant 13, record.ts `visible`)
// — so this is the capture rule holding over a tree that really had one.
check("the run's copy holds no dot entry, not even the one install wrote", !existsSync(join(runDirectory, "assembly", ".bot-source")));

// ---- the answer, three ways, and they are one file.
check("stdout is the request's canary and nothing else", stdout.trim() === canary, JSON.stringify(stdout));
check("the last stage sealed 0/success", sealed?.exit === 0 && sealed?.sealed === true, JSON.stringify(sealed));
check("stdout is exactly the bytes that stage sealed", stdout === text(join(runDirectory, sealed?.output?.path ?? "")), `${String(stdout.length)} bytes of stdout`);
check("bot run output --raw, asked while the assembly still stood, gave back that stdout", captured("run-output") === stdout && closed("run-output") === "0", `exit ${closed("run-output")}, ${String(captured("run-output").length)} bytes`);

// ---- and the uninstall, which is where the record's independence is decided.
check("bot assembly remove exited 0 and said so", closed("remove") === "0" && captured("remove").includes(`${NAME}  removed`), `exit ${closed("remove")} ${JSON.stringify(captured("remove"))}`);
const nowListed = bot("assembly", "list");
check("the home now holds no assemblies, and says so rather than saying nothing", nowListed.code === 1 && nowListed.out === "" && nowListed.err.trim() !== "", `exit ${String(nowListed.code)} ${JSON.stringify(nowListed.out)} ${JSON.stringify(nowListed.err)}`);
const gone = bot("assembly", "check", `${NAME}/${FLOW}`, "a request");
check("the bare name no longer resolves to anything", gone.code === 2 && /assembly-unknown/u.test(gone.err), `exit ${String(gone.code)} ${JSON.stringify(gone.err)}`);
// The run is not the assembly's. Removing what it ran takes nothing of what it
// recorded — record.md: "a run is self-contained for reading".
const listedRuns = bot("run", "list", "--limit", "200", "-j");
check("bot run list still lists the run whose assembly is gone", listedRuns.code === 0 && JSON.parse(listedRuns.out).data.some((row) => row.id === runName), runName);
const shown = bot("run", "show", runName, "-j");
const shownFacts = parseRunShow(shown.out, runName);
check("bot run show still reads that run's record", shown.code === 0 && shown.err === "" && shownFacts.error === undefined && shownFacts.data.run === runName && shownFacts.data.state === "ended" && shownFacts.data.exit === 0 && shownFacts.data.cause === "success", shownFacts.error ?? `exit ${String(shown.code)} ${shown.err}`);
const answered = bot("run", "output", runName, "--raw");
check("bot run output --raw still hands back the same answer, the assembly gone", answered.code === 0 && answered.out === stdout, `exit ${String(answered.code)}, ${String(answered.out.length)} bytes`);

verdict();
