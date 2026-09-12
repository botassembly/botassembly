import { bytewise } from "./model.ts";
import { RUN_LIST_CONTRACT } from "./run-list-query.ts";

type CapabilityHome = "never" | "reads" | "writes";
type CapabilityNetwork = "never" | "conditional" | "requested";
type CapabilityMode = "markdown" | "json" | "raw";
type CapabilityOptionType = "boolean" | "string" | "integer" | "timestamp" | "path" | "csv";
const NEW_OPERATIONS = ["assembly.check", "assembly.install", "assembly.link", "assembly.list", "assembly.remove", "assembly.update", "auth.import", "auth.list", "auth.login", "auth.logout", "capabilities", "home.busy", "home.show", "model.list", "run.check", "run.checklist", "run.events", "run.list", "run.output", "run.record", "run.request", "run.resume", "run.session", "run.show", "run.start"] as const;
export type NewOperation = (typeof NEW_OPERATIONS)[number];

type CapabilityOutput = { kind: string; schemaVersion: number } | { kind: "raw" };

export interface CliOptionDescriptor {
  name: string;
  aliases: readonly string[];
  type: CapabilityOptionType;
  repeatable: boolean;
  values?: readonly string[];
  default?: string | number | boolean;
  minimum?: number;
  maximum?: number;
  bytes?: number;
  required?: true;
}

export interface CliDescriptor {
  operation: NewOperation;
  command: readonly string[];
  output: CapabilityOutput;
  modes: readonly CapabilityMode[];
  home: CapabilityHome;
  mutates: boolean;
  network: CapabilityNetwork;
  options: readonly CliOptionDescriptor[];
  dynamicOptions?: readonly CliOptionDescriptor[];
  limits: Readonly<Record<string, number>>;
}

export const CAPABILITIES_DOCUMENT_BYTES = 65_536;
export const CAPABILITIES_RESULT = { kind: "bot.capabilities", schemaVersion: 1 } as const;
export const NEW_COMMAND_ERROR_BYTES = 2_048;
export const HOME_RESULT_BYTES = 4_096;
export const ASSEMBLY_CREATE_CONTRACT = { humanErrorBytes: NEW_COMMAND_ERROR_BYTES, resultBytes: 8_192 } as const;
export const ASSEMBLY_UPDATE_CONTRACT = { humanErrorBytes: NEW_COMMAND_ERROR_BYTES, reasonBytes: 512, resultBytes: 65_536 } as const;
export const ASSEMBLY_REMOVE_CONTRACT = { humanErrorBytes: NEW_COMMAND_ERROR_BYTES, resultBytes: 8_192 } as const;
export const AUTH_LOGIN_CONTRACT = { humanErrorBytes: NEW_COMMAND_ERROR_BYTES, identityBytes: 256,
  interactionBytes: 2_048, interactionCount: 100, interactionTotalBytesExclusive: 65_536, resultBytes: 4_096 } as const;
export const AUTH_LOGOUT_CONTRACT = { humanErrorBytes: NEW_COMMAND_ERROR_BYTES, identityBytes: 256, resultBytes: 4_096 } as const;
export const MODEL_LIST_CONTRACT = {
  page: { offsetMinimum: 0, offsetDefault: 0, offsetMaximum: 2_147_483_647, limitMinimum: 1, limitDefault: 50, limitMaximum: 200 },
  identityBytes: 1_024, rowBytesExclusive: 4_096, humanCellBytes: 480, humanRowBytes: 4_096,
  documentBytesExclusive: 1_048_576,
} as const;
export const AUTH_LIST_CONTRACT = {
  page: { offsetMinimum: 0, offsetDefault: 0, offsetMaximum: 2_147_483_647, limitMinimum: 1, limitDefault: 50, limitMaximum: 200 },
  identityBytes: 1_024, rowBytesExclusive: 4_096, humanCellBytes: 480, humanRowBytes: 4_096,
  documentBytesExclusive: 1_048_576,
} as const;
export const AUTH_IMPORT_CONTRACT = {
  humanErrorBytes: NEW_COMMAND_ERROR_BYTES, sourceArgumentBytes: 4_096, credentialFileBytesInclusive: 1_048_576,
  resultBytes: 8_192, destinationLockMilliseconds: 30_000, sourceLockMilliseconds: 1_000,
} as const;
export const RUN_START_CONTRACT = {
  operation: "run.start",
  result: { kind: "bot.run.result", schemaVersion: 1 },
  resultBytes: 65_536,
  reasonBytes: 2_048,
  correlationBytes: 256,
} as const;
const RUN_RESUME_CONTRACT = { ...RUN_START_CONTRACT, operation: "run.resume" } as const;

const capability: CliDescriptor = {
  operation: "capabilities", command: ["capabilities"], output: CAPABILITIES_RESULT,
  modes: ["markdown", "json"], home: "never", mutates: false, network: "never",
  options: [{ name: "--json", aliases: ["-j"], type: "boolean", repeatable: false }],
  limits: { documentBytes: CAPABILITIES_DOCUMENT_BYTES },
};

export const ASSEMBLY_READ_CONTRACT = {
  page: { minimum: 1, default: 20, maximum: 200 },
  cursor: { encodedBytes: 8_192, decodedBytes: 6_144 },
  output: { summaryTextBytes: 1_024, cellBytes: 480, rowBytes: 4_096, pageBytesExclusive: 1_048_576 },
} as const;

export const ASSEMBLY_LIST_FIELDS = ["name", "kind", "source", "updated", "target", "broken"] as const;
export type AssemblyListField = (typeof ASSEMBLY_LIST_FIELDS)[number];

const assemblyCheck: CliDescriptor = {
  operation: "assembly.check", command: ["assembly", "check"], output: { kind: "bot.assembly.check", schemaVersion: 1 },
  modes: ["markdown", "json"], home: "reads", mutates: false, network: "never",
  options: [
    { name: "--after", aliases: [], type: "string", repeatable: false, bytes: ASSEMBLY_READ_CONTRACT.cursor.encodedBytes },
    { name: "--home", aliases: [], type: "path", repeatable: false, default: "BOT_HOME, then platform default" },
    { name: "--in", aliases: [], type: "path", repeatable: false },
    { name: "--intelligence", aliases: [], type: "string", repeatable: false },
    { name: "--json", aliases: ["-j"], type: "boolean", repeatable: false },
    { name: "--limit", aliases: [], type: "integer", repeatable: false, default: ASSEMBLY_READ_CONTRACT.page.default,
      minimum: ASSEMBLY_READ_CONTRACT.page.minimum, maximum: ASSEMBLY_READ_CONTRACT.page.maximum },
    { name: "--local-context", aliases: [], type: "string", repeatable: false, values: ["ignore", "announce", "use"] },
    { name: "--retries", aliases: [], type: "integer", repeatable: false },
    { name: "--timeout", aliases: [], type: "integer", repeatable: false },
  ],
  dynamicOptions: [{ name: "--SLOT", aliases: [], type: "path", repeatable: true }],
  limits: {
    cursorDecodedBytes: ASSEMBLY_READ_CONTRACT.cursor.decodedBytes,
    cursorEncodedBytes: ASSEMBLY_READ_CONTRACT.cursor.encodedBytes,
    humanErrorBytes: NEW_COMMAND_ERROR_BYTES,
    markdownCellBytes: ASSEMBLY_READ_CONTRACT.output.cellBytes,
    markdownPageBytesExclusive: ASSEMBLY_READ_CONTRACT.output.pageBytesExclusive,
    markdownRowBytes: ASSEMBLY_READ_CONTRACT.output.rowBytes,
    pageDefault: ASSEMBLY_READ_CONTRACT.page.default,
    pageMaximum: ASSEMBLY_READ_CONTRACT.page.maximum,
  },
};

const assemblyList: CliDescriptor = {
  operation: "assembly.list", command: ["assembly", "list"], output: { kind: "bot.assembly.list", schemaVersion: 1 },
  modes: ["markdown", "json"], home: "reads", mutates: false, network: "never",
  options: [
    { name: "--after", aliases: [], type: "string", repeatable: false, bytes: ASSEMBLY_READ_CONTRACT.cursor.encodedBytes },
    { name: "--count", aliases: [], type: "boolean", repeatable: false },
    { name: "--fields", aliases: [], type: "csv", repeatable: false, values: ASSEMBLY_LIST_FIELDS,
      default: ASSEMBLY_LIST_FIELDS.join(",") },
    { name: "--home", aliases: [], type: "path", repeatable: false, default: "BOT_HOME, then platform default" },
    { name: "--json", aliases: ["-j"], type: "boolean", repeatable: false },
    { name: "--limit", aliases: [], type: "integer", repeatable: false, default: ASSEMBLY_READ_CONTRACT.page.default,
      minimum: ASSEMBLY_READ_CONTRACT.page.minimum, maximum: ASSEMBLY_READ_CONTRACT.page.maximum },
  ],
  limits: {
    cursorDecodedBytes: ASSEMBLY_READ_CONTRACT.cursor.decodedBytes,
    cursorEncodedBytes: ASSEMBLY_READ_CONTRACT.cursor.encodedBytes,
    humanErrorBytes: NEW_COMMAND_ERROR_BYTES,
    markdownCellBytes: ASSEMBLY_READ_CONTRACT.output.cellBytes,
    markdownPageBytesExclusive: ASSEMBLY_READ_CONTRACT.output.pageBytesExclusive,
    markdownRowBytes: ASSEMBLY_READ_CONTRACT.output.rowBytes,
    pageDefault: ASSEMBLY_READ_CONTRACT.page.default,
    pageMaximum: ASSEMBLY_READ_CONTRACT.page.maximum,
    summaryTextBytes: ASSEMBLY_READ_CONTRACT.output.summaryTextBytes,
  },
};

const assemblyCreateOptions: readonly CliOptionDescriptor[] = [
  { name: "--home", aliases: [], type: "path", repeatable: false, default: "BOT_HOME, then platform default" },
  { name: "--json", aliases: ["-j"], type: "boolean", repeatable: false },
  { name: "--name", aliases: [], type: "string", repeatable: false },
];

const assemblyInstall: CliDescriptor = {
  operation: "assembly.install", command: ["assembly", "install"], output: { kind: "bot.assembly.install", schemaVersion: 1 },
  modes: ["markdown", "json"], home: "writes", mutates: true, network: "conditional", options: assemblyCreateOptions,
  limits: { humanErrorBytes: NEW_COMMAND_ERROR_BYTES, resultBytes: ASSEMBLY_CREATE_CONTRACT.resultBytes },
};

const assemblyLink: CliDescriptor = {
  operation: "assembly.link", command: ["assembly", "link"], output: { kind: "bot.assembly.link", schemaVersion: 1 },
  modes: ["markdown", "json"], home: "writes", mutates: true, network: "never", options: assemblyCreateOptions,
  limits: assemblyInstall.limits,
};

const assemblyUpdate: CliDescriptor = {
  operation: "assembly.update", command: ["assembly", "update"], output: { kind: "bot.assembly.update", schemaVersion: 1 },
  modes: ["markdown", "json"], home: "writes", mutates: true, network: "conditional",
  options: assemblyCreateOptions.filter((option) => option.name !== "--name"),
  limits: {
    humanErrorBytes: ASSEMBLY_UPDATE_CONTRACT.humanErrorBytes,
    reasonBytes: ASSEMBLY_UPDATE_CONTRACT.reasonBytes,
    resultBytes: ASSEMBLY_UPDATE_CONTRACT.resultBytes,
  },
};

const assemblyRemove: CliDescriptor = {
  operation: "assembly.remove", command: ["assembly", "remove"], output: { kind: "bot.assembly.remove", schemaVersion: 1 },
  modes: ["markdown", "json"], home: "writes", mutates: true, network: "never",
  options: [
    { name: "--home", aliases: [], type: "path", repeatable: false, default: "BOT_HOME, then platform default" },
    { name: "--json", aliases: ["-j"], type: "boolean", repeatable: false },
  ],
  limits: { humanErrorBytes: NEW_COMMAND_ERROR_BYTES, resultBytes: ASSEMBLY_REMOVE_CONTRACT.resultBytes },
};

const authLogin: CliDescriptor = {
  operation: "auth.login", command: ["auth", "login"], output: { kind: "bot.auth.login", schemaVersion: 1 },
  modes: ["markdown", "json"], home: "never", mutates: true, network: "conditional",
  options: [{ name: "--json", aliases: ["-j"], type: "boolean", repeatable: false }],
  limits: AUTH_LOGIN_CONTRACT,
};

const authLogout: CliDescriptor = {
  operation: "auth.logout", command: ["auth", "logout"], output: { kind: "bot.auth.logout", schemaVersion: 1 },
  modes: ["markdown", "json"], home: "never", mutates: true, network: "never",
  options: [{ name: "--json", aliases: ["-j"], type: "boolean", repeatable: false }],
  limits: AUTH_LOGOUT_CONTRACT,
};

const modelList: CliDescriptor = {
  operation: "model.list", command: ["model", "list"], output: { kind: "bot.model.list", schemaVersion: 1 },
  modes: ["markdown", "json"], home: "never", mutates: false, network: "requested",
  options: [
    { name: "--json", aliases: ["-j"], type: "boolean", repeatable: false },
    { name: "--limit", aliases: [], type: "integer", repeatable: false, default: MODEL_LIST_CONTRACT.page.limitDefault,
      minimum: MODEL_LIST_CONTRACT.page.limitMinimum, maximum: MODEL_LIST_CONTRACT.page.limitMaximum },
    { name: "--live", aliases: [], type: "boolean", repeatable: false },
    { name: "--offset", aliases: [], type: "integer", repeatable: false, default: MODEL_LIST_CONTRACT.page.offsetDefault,
      minimum: MODEL_LIST_CONTRACT.page.offsetMinimum, maximum: MODEL_LIST_CONTRACT.page.offsetMaximum },
  ],
  limits: { documentBytesExclusive: MODEL_LIST_CONTRACT.documentBytesExclusive, humanCellBytes: MODEL_LIST_CONTRACT.humanCellBytes,
    humanErrorBytes: NEW_COMMAND_ERROR_BYTES, humanRowBytes: MODEL_LIST_CONTRACT.humanRowBytes,
    identityBytes: MODEL_LIST_CONTRACT.identityBytes, rowBytesExclusive: MODEL_LIST_CONTRACT.rowBytesExclusive },
};

const authList: CliDescriptor = {
  operation: "auth.list", command: ["auth", "list"], output: { kind: "bot.auth.list", schemaVersion: 1 },
  modes: ["markdown", "json"], home: "never", mutates: false, network: "never",
  options: [
    { name: "--json", aliases: ["-j"], type: "boolean", repeatable: false },
    { name: "--limit", aliases: [], type: "integer", repeatable: false, default: AUTH_LIST_CONTRACT.page.limitDefault,
      minimum: AUTH_LIST_CONTRACT.page.limitMinimum, maximum: AUTH_LIST_CONTRACT.page.limitMaximum },
    { name: "--offset", aliases: [], type: "integer", repeatable: false, default: AUTH_LIST_CONTRACT.page.offsetDefault,
      minimum: AUTH_LIST_CONTRACT.page.offsetMinimum, maximum: AUTH_LIST_CONTRACT.page.offsetMaximum },
  ],
  limits: { documentBytesExclusive: AUTH_LIST_CONTRACT.documentBytesExclusive, humanCellBytes: AUTH_LIST_CONTRACT.humanCellBytes,
    humanErrorBytes: NEW_COMMAND_ERROR_BYTES, humanRowBytes: AUTH_LIST_CONTRACT.humanRowBytes,
    identityBytes: AUTH_LIST_CONTRACT.identityBytes, rowBytesExclusive: AUTH_LIST_CONTRACT.rowBytesExclusive },
};

const authImport: CliDescriptor = {
  operation: "auth.import", command: ["auth", "import"], output: { kind: "bot.auth.import", schemaVersion: 1 },
  modes: ["markdown", "json"], home: "never", mutates: true, network: "never",
  options: [{ name: "--json", aliases: ["-j"], type: "boolean", repeatable: false }],
  limits: AUTH_IMPORT_CONTRACT,
};

const homeOptions: readonly CliOptionDescriptor[] = [
  { name: "--home", aliases: [], type: "path", repeatable: false, required: true },
  { name: "--json", aliases: ["-j"], type: "boolean", repeatable: false },
];

const homeShow: CliDescriptor = {
  operation: "home.show", command: ["home", "show"], output: { kind: "bot.home.show", schemaVersion: 1 },
  modes: ["markdown", "json"], home: "reads", mutates: false, network: "never", options: homeOptions,
  limits: { documentBytes: HOME_RESULT_BYTES, humanErrorBytes: NEW_COMMAND_ERROR_BYTES },
};

const homeBusy: CliDescriptor = {
  operation: "home.busy", command: ["home", "busy"], output: { kind: "bot.home.busy", schemaVersion: 1 },
  modes: ["markdown", "json"], home: "reads", mutates: false, network: "never",
  options: [
    { name: "--home", aliases: [], type: "path", repeatable: false, default: "BOT_HOME, then platform default" },
    { name: "--json", aliases: ["-j"], type: "boolean", repeatable: false },
    { name: "--quiet", aliases: [], type: "boolean", repeatable: false },
  ],
  limits: { humanErrorBytes: NEW_COMMAND_ERROR_BYTES },
};

const runList: CliDescriptor = {
  operation: RUN_LIST_CONTRACT.operation, command: ["run", "list"], output: RUN_LIST_CONTRACT.result,
  modes: ["markdown", "json"], home: "reads", mutates: false, network: "never",
  options: [
    { name: "--after", aliases: [], type: "string", repeatable: false, bytes: RUN_LIST_CONTRACT.cursor.encodedBytes },
    { name: "--assembly", aliases: [], type: "string", repeatable: true },
    { name: "--cause", aliases: [], type: "string", repeatable: true, values: RUN_LIST_CONTRACT.causes },
    { name: "--count", aliases: [], type: "boolean", repeatable: false },
    { name: "--fields", aliases: [], type: "csv", repeatable: false, values: RUN_LIST_CONTRACT.fields,
      default: RUN_LIST_CONTRACT.fields.join(",") },
    { name: "--flow", aliases: [], type: "string", repeatable: true },
    { name: "--home", aliases: [], type: "path", repeatable: false, default: "BOT_HOME, then platform default" },
    { name: "--json", aliases: ["-j"], type: "boolean", repeatable: false },
    { name: "--limit", aliases: [], type: "integer", repeatable: false, default: RUN_LIST_CONTRACT.page.default,
      minimum: RUN_LIST_CONTRACT.page.minimum, maximum: RUN_LIST_CONTRACT.page.maximum },
    { name: "--since", aliases: [], type: "timestamp", repeatable: false },
    { name: "--state", aliases: [], type: "string", repeatable: true, values: RUN_LIST_CONTRACT.states },
    { name: "--until", aliases: [], type: "timestamp", repeatable: false },
  ],
  limits: {
    cursorDecodedBytes: RUN_LIST_CONTRACT.cursor.decodedBytes,
    cursorEncodedBytes: RUN_LIST_CONTRACT.cursor.encodedBytes,
    filterBytes: RUN_LIST_CONTRACT.filters.bytes,
    filterValues: RUN_LIST_CONTRACT.filters.values,
    humanErrorBytes: NEW_COMMAND_ERROR_BYTES,
    markdownCellBytes: RUN_LIST_CONTRACT.output.cellBytes,
    markdownPageBytesExclusive: RUN_LIST_CONTRACT.output.pageBytesExclusive,
    markdownRowBytes: RUN_LIST_CONTRACT.output.rowBytes,
    pageDefault: RUN_LIST_CONTRACT.page.default,
    pageMaximum: RUN_LIST_CONTRACT.page.maximum,
    summaryTextBytes: RUN_LIST_CONTRACT.output.summaryTextBytes,
    warningCount: RUN_LIST_CONTRACT.warnings.count,
    warningDiagnosticBytes: RUN_LIST_CONTRACT.warnings.diagnosticBytes,
    warningLineBytes: RUN_LIST_CONTRACT.warnings.lineBytes,
  },
};

const runRecord: CliDescriptor = {
  operation: "run.record", command: ["run", "record"], output: { kind: "raw" },
  modes: ["raw"], home: "reads", mutates: false, network: "never",
  options: [
    { name: "--home", aliases: [], type: "path", repeatable: false, default: "BOT_HOME, then platform default" },
    { name: "--raw", aliases: [], type: "boolean", repeatable: false },
  ],
  limits: { humanErrorBytes: NEW_COMMAND_ERROR_BYTES },
};

const runCheck: CliDescriptor = {
  operation: "run.check", command: ["run", "check"], output: { kind: "bot.run.check", schemaVersion: 1 },
  modes: ["markdown", "json", "raw"], home: "reads", mutates: false, network: "never",
  options: [
    { name: "--file", aliases: [], type: "path", repeatable: false },
    { name: "--home", aliases: [], type: "path", repeatable: false, default: "BOT_HOME, then platform default" },
    { name: "--json", aliases: ["-j"], type: "boolean", repeatable: false },
    { name: "--raw", aliases: [], type: "boolean", repeatable: false },
    { name: "--repeat", aliases: [], type: "integer", repeatable: false, minimum: 1 },
    { name: "--retry", aliases: [], type: "integer", repeatable: false, minimum: 1 },
    { name: "--stage", aliases: [], type: "path", repeatable: false },
  ],
  limits: { captureBytes: 16_777_216, humanErrorBytes: NEW_COMMAND_ERROR_BYTES, recordBytes: 1_048_576 },
};

const runChecklist: CliDescriptor = {
  operation: "run.checklist", command: ["run", "checklist"], output: { kind: "bot.run.checklist", schemaVersion: 1 },
  modes: ["markdown", "json"], home: "reads", mutates: false, network: "never",
  options: [
    { name: "--home", aliases: [], type: "path", repeatable: false, default: "BOT_HOME, then platform default" },
    { name: "--json", aliases: ["-j"], type: "boolean", repeatable: false },
    { name: "--repeat", aliases: [], type: "integer", repeatable: false, minimum: 1 },
    { name: "--retry", aliases: [], type: "integer", repeatable: false, minimum: 1 },
    { name: "--stage", aliases: [], type: "path", repeatable: false },
  ],
  limits: { humanErrorBytes: NEW_COMMAND_ERROR_BYTES, markdownCellBytes: 480, recordBytes: 1_048_576 },
};

export const RUN_EVENTS_CONTRACT = {
  recordBytes: 1_048_576,
  recordSegments: 10_000,
  resultBytesExclusive: 2_097_152,
  humanErrorBytes: NEW_COMMAND_ERROR_BYTES,
} as const;

const runEvents: CliDescriptor = {
  operation: "run.events", command: ["run", "events"], output: { kind: "bot.run.events", schemaVersion: 1 },
  modes: ["markdown", "json"], home: "reads", mutates: false, network: "never",
  options: [
    { name: "--child", aliases: [], type: "path", repeatable: false },
    { name: "--home", aliases: [], type: "path", repeatable: false, default: "BOT_HOME, then platform default" },
    { name: "--json", aliases: ["-j"], type: "boolean", repeatable: false },
  ],
  limits: RUN_EVENTS_CONTRACT,
};

const runOutput: CliDescriptor = {
  operation: "run.output", command: ["run", "output"], output: { kind: "raw" },
  modes: ["raw"], home: "reads", mutates: false, network: "never",
  options: [
    { name: "--home", aliases: [], type: "path", repeatable: false, default: "BOT_HOME, then platform default" },
    { name: "--raw", aliases: [], type: "boolean", repeatable: false },
  ],
  limits: { humanErrorBytes: NEW_COMMAND_ERROR_BYTES },
};

const runRequest: CliDescriptor = {
  operation: "run.request", command: ["run", "request"], output: { kind: "raw" },
  modes: ["raw"], home: "reads", mutates: false, network: "never",
  options: runOutput.options, limits: runOutput.limits,
};

export const RUN_SESSION_CONTRACT = {
  cursorDecodedBytes: 6_144,
  cursorEncodedBytes: 8_192,
  humanErrorBytes: NEW_COMMAND_ERROR_BYTES,
  pageDefault: 100,
  pageMaximum: 500,
  rawInputBytes: 1_048_576,
  rawPhysicalLines: 10_000,
  renderedStdoutBytes: 1_048_576,
  sourceLineBytes: 1_048_576,
  sourcePassBytes: 4_194_304,
  sourcePhysicalLines: 1_000_000,
} as const;

const runSession: CliDescriptor = {
  operation: "run.session", command: ["run", "session"], output: { kind: "raw" },
  modes: ["markdown", "raw"], home: "reads", mutates: false, network: "never",
  options: [
    { name: "--after", aliases: [], type: "string", repeatable: false, bytes: RUN_SESSION_CONTRACT.cursorEncodedBytes },
    { name: "--home", aliases: [], type: "path", repeatable: false, default: "BOT_HOME, then platform default" },
    { name: "--limit", aliases: [], type: "integer", repeatable: false, default: RUN_SESSION_CONTRACT.pageDefault, minimum: 1, maximum: RUN_SESSION_CONTRACT.pageMaximum },
    { name: "--raw", aliases: [], type: "boolean", repeatable: false },
    { name: "--repeat", aliases: [], type: "integer", repeatable: false, minimum: 1 },
  ],
  limits: RUN_SESSION_CONTRACT,
};

const runShow: CliDescriptor = {
  operation: "run.show", command: ["run", "show"], output: { kind: "bot.run.show", schemaVersion: 1 },
  modes: ["markdown", "json"], home: "reads", mutates: false, network: "never",
  options: [
    { name: "--home", aliases: [], type: "path", repeatable: false, default: "BOT_HOME, then platform default" },
    { name: "--json", aliases: ["-j"], type: "boolean", repeatable: false },
  ],
  limits: { documentBytesExclusive: 1_048_576, humanErrorBytes: NEW_COMMAND_ERROR_BYTES, markdownCellBytes: 480, markdownRowBytes: 4_096, recordBytes: 1_048_576, rows: 1_000, sourceTextBytes: 4_096, warnings: 20 },
};

export const RUN_START_OPTIONS: readonly CliOptionDescriptor[] = [
  { name: "--correlation", aliases: [], type: "string", repeatable: false, bytes: RUN_START_CONTRACT.correlationBytes },
  { name: "--home", aliases: [], type: "path", repeatable: false, default: "BOT_HOME, then platform default" },
  { name: "--id-file", aliases: [], type: "path", repeatable: false },
  { name: "--in", aliases: [], type: "path", repeatable: false },
  { name: "--intelligence", aliases: [], type: "string", repeatable: false },
  { name: "--json", aliases: ["-j"], type: "boolean", repeatable: false },
  { name: "--local-context", aliases: [], type: "string", repeatable: false, values: ["ignore", "announce", "use"] },
  { name: "--retries", aliases: [], type: "integer", repeatable: false },
  { name: "--script", aliases: [], type: "path", repeatable: false },
  { name: "--timeout", aliases: [], type: "integer", repeatable: false },
];
export const RUN_RESUME_OPTIONS: readonly CliOptionDescriptor[] = RUN_START_OPTIONS.filter((option) =>
  ["--correlation", "--home", "--id-file", "--in", "--json"].includes(option.name));

const runStart: CliDescriptor = {
  operation: "run.start", command: ["run", "start"], output: RUN_START_CONTRACT.result,
  modes: ["markdown", "json"], home: "writes", mutates: true, network: "conditional",
  options: RUN_START_OPTIONS,
  dynamicOptions: [{ name: "--SLOT", aliases: [], type: "path", repeatable: true }],
  limits: {
    correlationBytes: RUN_START_CONTRACT.correlationBytes,
    humanErrorBytes: NEW_COMMAND_ERROR_BYTES,
    reasonBytes: RUN_START_CONTRACT.reasonBytes,
    resultBytes: RUN_START_CONTRACT.resultBytes,
  },
};

const runResume: CliDescriptor = {
  operation: "run.resume", command: ["run", "resume"], output: RUN_RESUME_CONTRACT.result,
  modes: ["markdown", "json"], home: "writes", mutates: true, network: "conditional",
  options: RUN_RESUME_OPTIONS,
  dynamicOptions: [{ name: "--SLOT", aliases: [], type: "path", repeatable: true }],
  limits: {
    correlationBytes: RUN_RESUME_CONTRACT.correlationBytes,
    humanErrorBytes: NEW_COMMAND_ERROR_BYTES,
    reasonBytes: RUN_RESUME_CONTRACT.reasonBytes,
    resultBytes: RUN_RESUME_CONTRACT.resultBytes,
  },
};

export const CLI_CONTRACTS: readonly CliDescriptor[] = [assemblyCheck, assemblyInstall, assemblyLink, assemblyList, assemblyRemove, assemblyUpdate, authImport, authList, authLogin, authLogout, capability, homeBusy, homeShow, modelList, runCheck, runChecklist, runEvents, runList, runOutput, runRecord, runRequest, runResume, runSession, runShow, runStart];

function repeated(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

export function descriptorFault(descriptors: readonly CliDescriptor[]): string | undefined {
  const operations = descriptors.map((held) => held.operation);
  const commands = descriptors.map((held) => held.command.join("\0"));
  if (repeated(operations)) return "duplicate operation";
  if (operations.length !== NEW_OPERATIONS.length || NEW_OPERATIONS.some((operation) => !operations.includes(operation))) {
    return "operation inventory mismatch";
  }
  if (repeated(commands)) return "duplicate command path";
  if (descriptors.some((held) => !["never", "conditional", "requested"].includes(held.network))) return "unknown network behavior";
  if (descriptors.some((held) => repeated([...held.options, ...(held.dynamicOptions ?? [])].map((option) => option.name)))) return "duplicate option";
  if (descriptors.some((held) => [...held.options, ...(held.dynamicOptions ?? [])]
    .some((option) => option.required !== undefined && Reflect.get(option, "required") !== true))) return "invalid required option";
  if ([...descriptors].sort((first, second) => bytewise(first.operation, second.operation))
    .some((held, index) => held !== descriptors[index])) return "commands are not sorted";
  if (descriptors.some((held) => [...held.options].sort((first, second) => bytewise(first.name, second.name))
    .some((option, index) => option !== held.options[index]))) return "options are not sorted";
  return undefined;
}

export function commandDescriptor(words: readonly string[]): CliDescriptor | undefined {
  return CLI_CONTRACTS.find((held) => held.command.every((word, index) => words[index] === word));
}
