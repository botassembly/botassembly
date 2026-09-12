import { CLI_CONTRACTS, commandDescriptor, type CliDescriptor, type CliOptionDescriptor, type NewOperation } from "./cli-contract.ts";

function optionLine(option: CliOptionDescriptor): string {
  const names = [option.name, ...option.aliases].join(", ");
  const type = option.type === "timestamp" ? "YYYY-MM-DDTHH:mm:ss.sssZ" : option.type;
  const details = [
    option.repeatable ? "repeatable" : "once",
    option.values === undefined ? "" : `values ${option.values.join(", ")}`,
    option.default === undefined ? "" : `default ${String(option.default)}`,
    option.minimum === undefined ? "" : `minimum ${String(option.minimum)}`,
    option.maximum === undefined ? "" : `maximum ${String(option.maximum)}`,
    option.bytes === undefined ? "" : `at most ${option.bytes.toLocaleString("en-US")} bytes`,
    option.required === true ? "required" : "",
  ].filter((part) => part.length > 0).join("; ");
  return `  ${names}  ${type}; ${details}`;
}

function optionLines(held: CliDescriptor): string { return held.options.map(optionLine).join("\n"); }

function dynamicOptionLines(held: CliDescriptor): string {
  return (held.dynamicOptions ?? []).map(optionLine).join("\n");
}

function outputName(held: CliDescriptor): string {
  return "schemaVersion" in held.output
    ? `${held.output.kind}@${String(held.output.schemaVersion)}`
    : held.output.kind;
}

function namedLimit(held: CliDescriptor, name: string): string {
  const value = held.limits[name]; return value === undefined ? "missing" : value.toLocaleString("en-US");
}

function descriptor(operation: NewOperation): CliDescriptor { const held = CLI_CONTRACTS.find((candidate) => candidate.operation === operation);
  if (held === undefined) throw new Error(`Missing CLI descriptor for ${operation}.`); return held;
}

function overviewLine(held: CliDescriptor): string {
  const descriptions: Record<NewOperation, string> = {
    capabilities: "report the implemented structured command surface",
    "assembly.check": "validate an assembly through the structured command surface",
    "assembly.install": "copy an assembly into one Bot home",
    "assembly.link": "link a working assembly into one Bot home",
    "assembly.list": "list assemblies through the structured command surface",
    "assembly.remove": "remove one assembly installation from one Bot home",
    "assembly.update": "refresh installed assemblies through the structured command surface",
    "auth.import": "copy one retired credential map into empty Pi authentication",
    "auth.list": "list safe Pi authentication status",
    "auth.login": "sign in through one provider's supported credential flow",
    "auth.logout": "remove one provider's stored Pi credential",
    "home.busy": "report whether a directory has a live run",
    "home.show": "show one explicit Bot home installation identity",
    "model.list": "list Pi runtime model availability",
    "run.check": "list or read one named recorded check",
    "run.checklist": "list the checklist marks recorded by one run",
    "run.events": "read one complete root or child run record",
    "run.list": "list runs through the structured command surface",
    "run.output": "copy one accepted output exactly as stored",
    "run.record": "copy one retained root record exactly as stored",
    "run.request": "copy one retained root request exactly as stored",
    "run.resume": "resume one run and return its complete result",
    "run.session": "read one stage session through the current command surface",
    "run.show": "show one run as a bounded structured reading",
    "run.start": "start one run and return its complete result",
  };
  return `  ${held.command.join(" ")}  ${descriptions[held.operation]}`;
}

const OVERVIEW = `bot — run agent assemblies and inspect what they leave behind

usage: bot <command> [arguments]

${CLI_CONTRACTS.map(overviewLine).join("\n")}

\`bot <command> --help\` describes one command.
`;

const RUN_RECORD_DESCRIPTOR = descriptor("run.record");
const RUN_CHECK_DESCRIPTOR = descriptor("run.check");
const RUN_CHECK = `usage: bot run check <run> <name> [--file PATH] [--stage PATH --retry N [--repeat N]] [--json|--raw] [--home DIR]

Lists every well-formed recording for one exact check name. An attempt selector narrows by stage, retry, and optional repeat. Raw mode returns one safely held capture of at most 16,777,216 bytes.

options:
${optionLines(RUN_CHECK_DESCRIPTOR)}

Modes: ${RUN_CHECK_DESCRIPTOR.modes.join(", ")}. Output: ${outputName(RUN_CHECK_DESCRIPTOR)}.
Network: ${RUN_CHECK_DESCRIPTOR.network}. Home: ${RUN_CHECK_DESCRIPTOR.home}.

`;
const RUN_CHECKLIST_DESCRIPTOR = descriptor("run.checklist");
const RUN_CHECKLIST = `usage: bot run checklist <run> [--stage PATH] [--retry N] [--repeat N] [--json|-j] [--home DIR]

Lists the checklist marks retained in one root run record. Each selector works alone or in combination. The command reads at most ${namedLimit(RUN_CHECKLIST_DESCRIPTOR, "recordBytes")} record bytes and makes each Markdown cell at most ${namedLimit(RUN_CHECKLIST_DESCRIPTOR, "markdownCellBytes")} bytes.

options:
${optionLines(RUN_CHECKLIST_DESCRIPTOR)}

Modes: ${RUN_CHECKLIST_DESCRIPTOR.modes.join(", ")}. Output: ${outputName(RUN_CHECKLIST_DESCRIPTOR)}.
Network: ${RUN_CHECKLIST_DESCRIPTOR.network}. Home: ${RUN_CHECKLIST_DESCRIPTOR.home}. Mutates: ${String(RUN_CHECKLIST_DESCRIPTOR.mutates)}.

`;

const RUN_EVENTS_DESCRIPTOR = descriptor("run.events");
const RUN_EVENTS = `usage: bot run events <run> [--child REFERENCE] [--json|-j] [--home DIR]

Reads the complete semantic event sequence from one root record or an authorized child record. Human mode preserves the complete record reading. JSON mode returns one versioned document. Use run record --raw for exact retained root bytes.

options:
${optionLines(RUN_EVENTS_DESCRIPTOR)}

Modes: ${RUN_EVENTS_DESCRIPTOR.modes.join(", ")}. Output: ${outputName(RUN_EVENTS_DESCRIPTOR)}.
Network: ${RUN_EVENTS_DESCRIPTOR.network}. Home: ${RUN_EVENTS_DESCRIPTOR.home}. Mutates: ${String(RUN_EVENTS_DESCRIPTOR.mutates)}.

`;
const RUN_RECORD = `usage: bot run record <run> --raw [--home DIR]

Copies one root run's retained record exactly as stored without endorsing it.

options:
${optionLines(RUN_RECORD_DESCRIPTOR)}

Modes: ${RUN_RECORD_DESCRIPTOR.modes.join(", ")}. Output: raw bytes with no structured envelope.
Network: ${RUN_RECORD_DESCRIPTOR.network}. Home: ${RUN_RECORD_DESCRIPTOR.home}. Mutates: ${String(RUN_RECORD_DESCRIPTOR.mutates)}.

`;

const RUN_OUTPUT_DESCRIPTOR = descriptor("run.output");
const RUN_OUTPUT = `usage: bot run output <run> [stage] --raw [--home DIR]

Copies one hash-verified accepted output exactly as stored. Without a stage,
the run must have completed successfully. A stage selects its latest sealed
output under the existing output rules.

options:
${optionLines(RUN_OUTPUT_DESCRIPTOR)}

Modes: ${RUN_OUTPUT_DESCRIPTOR.modes.join(", ")}. Output: raw bytes with no structured envelope.
Network: ${RUN_OUTPUT_DESCRIPTOR.network}. Home: ${RUN_OUTPUT_DESCRIPTOR.home}.
The command verifies one held extent before delivery and detects a changed delivery hash.

example:
  bot run output 2026-08-01T11-00-00 --raw > answer.txt
`;

const RUN_REQUEST_DESCRIPTOR = descriptor("run.request");
const RUN_REQUEST = `usage: bot run request <run> --raw [--home DIR]

Copies one retained root request after its recorded byte count and SHA-256
match the held file. It uses bounded memory and has no content-size limit.

options:
${optionLines(RUN_REQUEST_DESCRIPTOR)}

Modes: ${RUN_REQUEST_DESCRIPTOR.modes.join(", ")}. Output: raw bytes with no structured envelope.
Network: ${RUN_REQUEST_DESCRIPTOR.network}. Home: ${RUN_REQUEST_DESCRIPTOR.home}.
`;

const RUN_SHOW_DESCRIPTOR = descriptor("run.show");
const RUN_SHOW = `usage: bot run show <run> [--json|-j] [--home DIR]

Reads one root record snapshot, then reports bounded run, stage, subflow, liveness, and scratch facts. It never opens child records or contacts a provider.

options:
${optionLines(RUN_SHOW_DESCRIPTOR)}

Modes: ${RUN_SHOW_DESCRIPTOR.modes.join(", ")}. Output: ${outputName(RUN_SHOW_DESCRIPTOR)}.
Network: ${RUN_SHOW_DESCRIPTOR.network}. Home: ${RUN_SHOW_DESCRIPTOR.home}. Mutates: ${String(RUN_SHOW_DESCRIPTOR.mutates)}.

example:
  bot run show 2026-08-01T11-00-00 -j
`;

const RUN_START_DESCRIPTOR = descriptor("run.start");
const RUN_START = `usage: bot run start <assembly>[/<flow>] [request] [options]\n\nStarts one run through the runtime. A first run initializes a missing home\nidentity before run birth. Human mode preserves the accepted final output.\n--json and -j return one bounded result for every run that reached run_start.\n\noptions:\n${optionLines(RUN_START_DESCRIPTOR)}\n${dynamicOptionLines(RUN_START_DESCRIPTOR)}\n\nModes: ${RUN_START_DESCRIPTOR.modes.join(", ")}. Output: ${outputName(RUN_START_DESCRIPTOR)}.\nNetwork: ${RUN_START_DESCRIPTOR.network}. Home: ${RUN_START_DESCRIPTOR.home}.\n\nexample:\n  bot run start review/main "check this change" --correlation caller-42 -j\n`;

const RUN_RESUME_DESCRIPTOR = descriptor("run.resume");
const RUN_RESUME = `usage: bot run resume <run> [options]\n\nStarts a new run from one donor through the resume runtime. A first resume\ninitializes a missing home identity before run birth. Human mode preserves the\naccepted output. --json and -j return one bounded result with the donor and\ndurably carried stage count.\n\noptions:\n${optionLines(RUN_RESUME_DESCRIPTOR)}\n${dynamicOptionLines(RUN_RESUME_DESCRIPTOR)}\n\nModes: ${RUN_RESUME_DESCRIPTOR.modes.join(", ")}. Output: ${outputName(RUN_RESUME_DESCRIPTOR)}.\nNetwork: ${RUN_RESUME_DESCRIPTOR.network}. Home: ${RUN_RESUME_DESCRIPTOR.home}.\n\nexample:\n  bot run resume 2026-08-01T11-00-00-a3f9 --correlation caller-42 -j\n`;

const RUN_SESSION_DESCRIPTOR = descriptor("run.session");
const RUN_SESSION = `usage: bot run session <run> <stage> [--repeat N] [--limit N] [--after CURSOR] [--raw] [--home DIR]

Reads one retained stage session. Markdown mode returns bounded message pages. Raw mode returns the exact bounded session bytes and cannot be combined with pagination.

options:
${optionLines(RUN_SESSION_DESCRIPTOR)}

Modes: ${RUN_SESSION_DESCRIPTOR.modes.join(", ")}. Output: rendered Markdown or exact raw bytes.
Network: ${RUN_SESSION_DESCRIPTOR.network}. Home: ${RUN_SESSION_DESCRIPTOR.home}. Mutates: ${String(RUN_SESSION_DESCRIPTOR.mutates)}.

`;

const RUN_LIST_DESCRIPTOR = descriptor("run.list");
const RUN_LIST = `usage: bot ${RUN_LIST_DESCRIPTOR.command.join(" ")} [filters] [options]

Lists runs without network access. Human output is a bounded Markdown table.
Modes: ${RUN_LIST_DESCRIPTOR.modes.join(", ")}. Output: ${outputName(RUN_LIST_DESCRIPTOR)}.
Network: ${RUN_LIST_DESCRIPTOR.network}. Home: ${RUN_LIST_DESCRIPTOR.home}.

options:
${optionLines(RUN_LIST_DESCRIPTOR)}

Across filters: at most ${namedLimit(RUN_LIST_DESCRIPTOR, "filterValues")} distinct values and ${namedLimit(RUN_LIST_DESCRIPTOR, "filterBytes")} UTF-8 bytes.
Cursor documents decode to at most ${namedLimit(RUN_LIST_DESCRIPTOR, "cursorDecodedBytes")} bytes.

example:
  bot run list --state ended --limit 20 -j
`;

const CAPABILITIES_DESCRIPTOR = descriptor("capabilities");
const CAPABILITIES = `usage: bot ${CAPABILITIES_DESCRIPTOR.command.join(" ")} [--json|-j]

Reports only the new command contracts compiled into this executable.
Modes: ${CAPABILITIES_DESCRIPTOR.modes.join(", ")}. Output: ${outputName(CAPABILITIES_DESCRIPTOR)}.
Network: ${CAPABILITIES_DESCRIPTOR.network}. Home: ${CAPABILITIES_DESCRIPTOR.home}.

options:
${optionLines(CAPABILITIES_DESCRIPTOR)}

example:
  bot capabilities -j
`;

const HOME_SHOW_DESCRIPTOR = descriptor("home.show");
const HOME_SHOW = `usage: bot home show --home DIR [--json|-j]\n\nReads one explicitly selected home without changing it. A missing home or installation record reports Initialized: no. Bot has no identity reset command.\n\noptions:\n${optionLines(HOME_SHOW_DESCRIPTOR)}\n\nModes: ${HOME_SHOW_DESCRIPTOR.modes.join(", ")}. Output: ${outputName(HOME_SHOW_DESCRIPTOR)}.\nNetwork: ${HOME_SHOW_DESCRIPTOR.network}. Home: ${HOME_SHOW_DESCRIPTOR.home}.\nMoving the record, or copying it with ownership and modes preserved, retains the identity.\n\nexample:\n  bot home show --home ./bot-home -j\n`;

const HOME_BUSY_DESCRIPTOR = descriptor("home.busy");
const HOME_BUSY = `usage: bot home busy <directory> [--quiet|--json|-j] [--home DIR]\n\nReports whether any live run holds the caller-resolved directory. Quiet mode writes nothing and exits 0 when busy or 1 when idle.\n\noptions:\n${optionLines(HOME_BUSY_DESCRIPTOR)}\n\nModes: ${HOME_BUSY_DESCRIPTOR.modes.join(", ")}. Output: ${outputName(HOME_BUSY_DESCRIPTOR)}.\nNetwork: ${HOME_BUSY_DESCRIPTOR.network}. Home: ${HOME_BUSY_DESCRIPTOR.home}.\n\nexample:\n  bot home busy ./worktree --quiet\n`;

const ASSEMBLY_CHECK_DESCRIPTOR = descriptor("assembly.check");
const ASSEMBLY_CHECK = `usage: bot assembly check <assembly>[/<flow>] [request] [options]\n\nValidates an assembly without calling a model and reports the stages in execution order.\nModes: ${ASSEMBLY_CHECK_DESCRIPTOR.modes.join(", ")}. Output: ${outputName(ASSEMBLY_CHECK_DESCRIPTOR)}.\nNetwork: ${ASSEMBLY_CHECK_DESCRIPTOR.network}. Home: ${ASSEMBLY_CHECK_DESCRIPTOR.home}.\n\noptions:\n${optionLines(ASSEMBLY_CHECK_DESCRIPTOR)}\n${dynamicOptionLines(ASSEMBLY_CHECK_DESCRIPTOR)}\n\nexample:\n  bot assembly check review/main --json\n`;

const ASSEMBLY_LIST_DESCRIPTOR = descriptor("assembly.list");
const ASSEMBLY_LIST = `usage: bot assembly list [options]\n\nLists the assemblies held by one Bot home in name order.\nModes: ${ASSEMBLY_LIST_DESCRIPTOR.modes.join(", ")}. Output: ${outputName(ASSEMBLY_LIST_DESCRIPTOR)}.\nNetwork: ${ASSEMBLY_LIST_DESCRIPTOR.network}. Home: ${ASSEMBLY_LIST_DESCRIPTOR.home}.\n\noptions:\n${optionLines(ASSEMBLY_LIST_DESCRIPTOR)}\n\nexample:\n  bot assembly list --home ./bot-home --json\n`;

const ASSEMBLY_INSTALL_DESCRIPTOR = descriptor("assembly.install");
const ASSEMBLY_INSTALL = `usage: bot assembly install <source>[#subdir] [options]\n\nCopies one local or Git-sourced assembly into the home without replacing an existing name.\n\noptions:\n${optionLines(ASSEMBLY_INSTALL_DESCRIPTOR)}\n\nModes: ${ASSEMBLY_INSTALL_DESCRIPTOR.modes.join(", ")}. Output: ${outputName(ASSEMBLY_INSTALL_DESCRIPTOR)}.\nNetwork: ${ASSEMBLY_INSTALL_DESCRIPTOR.network}. Home: ${ASSEMBLY_INSTALL_DESCRIPTOR.home}.\n\nexample:\n  bot assembly install https://github.com/acme/bots#review --json\n`;

const ASSEMBLY_LINK_DESCRIPTOR = descriptor("assembly.link");
const ASSEMBLY_LINK = `usage: bot assembly link <path> [options]\n\nLinks one local working assembly into the home without replacing an existing name.\n\noptions:\n${optionLines(ASSEMBLY_LINK_DESCRIPTOR)}\n\nModes: ${ASSEMBLY_LINK_DESCRIPTOR.modes.join(", ")}. Output: ${outputName(ASSEMBLY_LINK_DESCRIPTOR)}.\nNetwork: ${ASSEMBLY_LINK_DESCRIPTOR.network}. Home: ${ASSEMBLY_LINK_DESCRIPTOR.home}.\n\nexample:\n  bot assembly link ./review --json\n`;

const ASSEMBLY_UPDATE_DESCRIPTOR = descriptor("assembly.update");
const ASSEMBLY_UPDATE = `usage: bot assembly update [<name>] [options]\n\nRefreshes one installed assembly, or every assembly with a source when no name is given. A batch stops after its first failure and reports every settled outcome.\n\noptions:\n${optionLines(ASSEMBLY_UPDATE_DESCRIPTOR)}\n\nModes: ${ASSEMBLY_UPDATE_DESCRIPTOR.modes.join(", ")}. Output: ${outputName(ASSEMBLY_UPDATE_DESCRIPTOR)}.\nNetwork: ${ASSEMBLY_UPDATE_DESCRIPTOR.network}. Home: ${ASSEMBLY_UPDATE_DESCRIPTOR.home}.\n\nexample:\n  bot assembly update review --json\n`;

const ASSEMBLY_REMOVE_DESCRIPTOR = descriptor("assembly.remove");
const ASSEMBLY_REMOVE = `usage: bot assembly remove <name> [options]\n\nRemoves one installed copy or link from the home. A linked source and neighboring installations stay untouched.\n\noptions:\n${optionLines(ASSEMBLY_REMOVE_DESCRIPTOR)}\n\nModes: ${ASSEMBLY_REMOVE_DESCRIPTOR.modes.join(", ")}. Output: ${outputName(ASSEMBLY_REMOVE_DESCRIPTOR)}.\nNetwork: ${ASSEMBLY_REMOVE_DESCRIPTOR.network}. Home: ${ASSEMBLY_REMOVE_DESCRIPTOR.home}.\n\nexample:\n  bot assembly remove review --json\n`;

const AUTH_LOGIN_DESCRIPTOR = descriptor("auth.login");
const AUTH_LOGIN = `usage: bot auth login <provider> [--json|-j]\n\nRuns the exact provider's interactive Pi login and stores its returned credential. Provider prompts and notices use standard error; standard output carries only the final bounded result.\n\noptions:\n${optionLines(AUTH_LOGIN_DESCRIPTOR)}\n\nModes: ${AUTH_LOGIN_DESCRIPTOR.modes.join(", ")}. Output: ${outputName(AUTH_LOGIN_DESCRIPTOR)}.\nNetwork: ${AUTH_LOGIN_DESCRIPTOR.network}. Home: ${AUTH_LOGIN_DESCRIPTOR.home}.\n\nA synchronization failure after persistence keeps the truthful success result, reports a non-retryable error, and exits nonzero.\n\nexample:\n  bot auth login openai-codex --json\n`;

const AUTH_LOGOUT_DESCRIPTOR = descriptor("auth.logout");
const AUTH_LOGOUT = `usage: bot auth logout <provider> [--json|-j]\n\nCompletes the exact provider's idempotent Pi credential deletion without an existence preflight.\n\noptions:\n${optionLines(AUTH_LOGOUT_DESCRIPTOR)}\n\nModes: ${AUTH_LOGOUT_DESCRIPTOR.modes.join(", ")}. Output: ${outputName(AUTH_LOGOUT_DESCRIPTOR)}.\nNetwork: ${AUTH_LOGOUT_DESCRIPTOR.network}. Home: ${AUTH_LOGOUT_DESCRIPTOR.home}.\n\nThe dedicated Pi runtime loads no model file and performs no refresh or authentication check before deletion. Completed does not claim that a credential existed or that ambient authentication is disabled.\n\nexample:\n  bot auth logout openai-codex --json\n`;

const MODEL_LIST_DESCRIPTOR = descriptor("model.list");
const MODEL_LIST = `usage: bot model list [provider] [options]\n\nLists Pi runtime model availability. --live compares the local set with a requested catalog refresh.\n\noptions:\n${optionLines(MODEL_LIST_DESCRIPTOR)}\n\nModes: ${MODEL_LIST_DESCRIPTOR.modes.join(", ")}. Output: ${outputName(MODEL_LIST_DESCRIPTOR)}.\nNetwork: ${MODEL_LIST_DESCRIPTOR.network}. Home: ${MODEL_LIST_DESCRIPTOR.home}.\n\nA failed or aborted live refresh reports no stale model rows. PI_OFFLINE forbids catalog network during --live.\n\nexample:\n  bot model list openai --live --json\n`;

const AUTH_LIST_DESCRIPTOR = descriptor("auth.list");
const AUTH_LIST = `usage: bot auth list [options]\n\nLists a bounded safe projection of Pi credential metadata without resolving, probing, refreshing, or printing a credential.\n\noptions:\n${optionLines(AUTH_LIST_DESCRIPTOR)}\n\nModes: ${AUTH_LIST_DESCRIPTOR.modes.join(", ")}. Output: ${outputName(AUTH_LIST_DESCRIPTOR)}.\nNetwork: ${AUTH_LIST_DESCRIPTOR.network}. Home: ${AUTH_LIST_DESCRIPTOR.home}.\n\nStates are stored or unobserved. Unobserved does not mean unavailable. Provider rows sort bytewise before offset paging.\n\nexample:\n  bot auth list --json\n`;

const AUTH_IMPORT_DESCRIPTOR = descriptor("auth.import");
const AUTH_IMPORT = `usage: bot auth import SOURCE [--json|-j]\n\nCopies one complete compatible retired Bot credential map into missing or empty Pi authentication. It never merges, overwrites, selects, or deletes source credentials.\n\noptions:\n${optionLines(AUTH_IMPORT_DESCRIPTOR)}\n\nModes: ${AUTH_IMPORT_DESCRIPTOR.modes.join(", ")}. Output: ${outputName(AUTH_IMPORT_DESCRIPTOR)}.\nNetwork: ${AUTH_IMPORT_DESCRIPTOR.network}. Home: ${AUTH_IMPORT_DESCRIPTOR.home}. Mutates: ${String(AUTH_IMPORT_DESCRIPTOR.mutates)}.\n\nexample:\n  bot auth import ~/.local/share/bot/credentials.json --json\n`;

const SCREENS = new Map([
  ["run check", RUN_CHECK], ["run checklist", RUN_CHECKLIST], ["run events", RUN_EVENTS], ["run list", RUN_LIST], ["run output", RUN_OUTPUT], ["run record", RUN_RECORD], ["run request", RUN_REQUEST], ["run resume", RUN_RESUME], ["run session", RUN_SESSION], ["run show", RUN_SHOW], ["run start", RUN_START],
  ["home busy", HOME_BUSY], ["home show", HOME_SHOW], ["capabilities", CAPABILITIES],
  ["assembly check", ASSEMBLY_CHECK], ["assembly install", ASSEMBLY_INSTALL], ["assembly link", ASSEMBLY_LINK], ["assembly list", ASSEMBLY_LIST], ["assembly remove", ASSEMBLY_REMOVE], ["assembly update", ASSEMBLY_UPDATE],
  ["auth import", AUTH_IMPORT], ["auth list", AUTH_LIST], ["auth login", AUTH_LOGIN], ["auth logout", AUTH_LOGOUT], ["model list", MODEL_LIST],
]);

export function helpScreen(command: string, args: readonly string[]): string | undefined {
  if (command === "" || command === "--help") return OVERVIEW;
  return args.length === 1 && args[0] === "--help" ? SCREENS.get(command) : undefined;
}

export function newHelpScreen(words: readonly string[]): string | undefined {
  const held = commandDescriptor(words);
  return held === undefined ? undefined : helpScreen(held.command.join(" "), words.slice(held.command.length));
}
