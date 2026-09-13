import { CAPABILITIES_DOCUMENT_BYTES, CAPABILITIES_RESULT, CLI_CONTRACTS, descriptorFault, type CliDescriptor, type CliOptionDescriptor } from "./cli-contract.ts";
import { jsonObject } from "./check.ts";
import { inertText, newCommandFailure, type CommandResult } from "./new-command-result.ts";
import { bytewise } from "./model.ts";
import { RUNTIME_VERSION } from "./record-events.ts";
import type { CliFailure } from "./run-list-query.ts";
import { resolveRuntimeSourceIdentity, type RuntimeSourceIdentity, type RuntimeSourceIdentityResolution } from "./runtime-provenance.ts";

interface Boundary {
  stdout(bytes: string | Uint8Array): void;
  stderr(bytes: string | Uint8Array): void;
}

function failure(cause: string, message: string, exit: CliFailure["exit"] = 2): CliFailure {
  return { code: exit === 2 ? "request-invalid" : exit === 4 ? "dependency-failed" : "integrity-failed",
    cause, message, retryable: exit === 4, details: {}, exit };
}

function optionConstraint(option: CliOptionDescriptor): string {
  const parts = [
    option.values === undefined ? "" : `values: ${option.values.join(", ")}`,
    option.default === undefined ? "" : `default: ${String(option.default)}`,
    option.minimum === undefined ? "" : `minimum: ${String(option.minimum)}`,
    option.maximum === undefined ? "" : `maximum: ${String(option.maximum)}`,
    option.bytes === undefined ? "" : `bytes: ${String(option.bytes)}`,
    option.required === true ? "required: true" : "",
  ];
  return parts.filter((held) => held.length > 0).join("; ") || "-";
}

function cell(value: string): string {
  return inertText(value, 2_048).text;
}

function runtimeLine(identity: RuntimeSourceIdentity): string {
  return `Runtime: ${RUNTIME_VERSION}; source: ${identity.runtimeSource}; digest: ${identity.runtimeDigest ?? "-"}; source tree SHA-256: ${identity.runtimeTreeSha256}`;
}

function markdown(descriptors: readonly CliDescriptor[], identity: RuntimeSourceIdentity): string {
  const commandRows = descriptors.map((held) => {
    const output = cell("schemaVersion" in held.output ? `${held.output.kind}@${String(held.output.schemaVersion)}` : held.output.kind);
    return `| ${cell(held.operation)} | ${cell(held.command.join(" "))} | ${output} | ${held.modes.join(", ")} | ${held.home} | ${String(held.mutates)} | ${held.network} |`;
  });
  const optionRows = descriptors.flatMap((held) => [...held.options, ...(held.dynamicOptions ?? [])].map((option) => {
    const aliases = cell(option.aliases.join(", ") || "-");
    return `| ${cell(held.operation)} | ${cell(option.name)} | ${aliases} | ${option.type} | ${String(option.repeatable)} | ${cell(optionConstraint(option))} |`;
  }));
  const limitRows = descriptors.flatMap((held) => Object.entries(held.limits)
    .sort(([first], [second]) => bytewise(first, second))
    .map(([name, value]) => `| ${cell(held.operation)} | ${cell(name)} | ${String(value)} |`));
  return [
    "# Bot capabilities", runtimeLine(identity), "", "## Commands", "",
    "| operation | command | output | modes | home | mutates | network |",
    "| --- | --- | --- | --- | --- | --- | --- |", ...commandRows, "", "## Options", "",
    "| operation | option | aliases | type | repeatable | constraints |",
    "| --- | --- | --- | --- | --- | --- |", ...optionRows, "", "## Limits", "",
    "| operation | limit | value |", "| --- | --- | --- |", ...limitRows, "",
  ].join("\n");
}

function document(descriptors: readonly CliDescriptor[], identity: RuntimeSourceIdentity): string {
  return `${jsonObject({ schemaVersion: CAPABILITIES_RESULT.schemaVersion, kind: CAPABILITIES_RESULT.kind, data: {
    runtime: RUNTIME_VERSION, ...identity, commands: descriptors,
  } })}\n`;
}

export function capabilitiesResult(descriptors: readonly CliDescriptor[], json: boolean, identity: RuntimeSourceIdentity): CommandResult {
  const descriptorProblem = descriptorFault(descriptors);
  const structured = document(descriptors, identity), human = markdown(descriptors, identity);
  if (descriptorProblem !== undefined || Buffer.byteLength(structured) > CAPABILITIES_DOCUMENT_BYTES
    || Buffer.byteLength(human) > CAPABILITIES_DOCUMENT_BYTES) {
    return newCommandFailure("capabilities", failure("descriptor-invalid", "Bot's compiled command inventory is invalid or exceeds its output bound.", 5), json);
  }
  return { exit: 0, stdout: Buffer.from(json ? structured : human), stderr: Buffer.alloc(0) };
}

function requestFault(args: readonly string[]): CliFailure | undefined {
  const modes = args.filter((word) => word === "--json" || word === "-j");
  if (modes.length > 1) return failure("option-repeated", "Capabilities accepts one JSON mode flag.");
  const unknown = args.find((word) => word !== "--json" && word !== "-j");
  return unknown === undefined ? undefined : failure("argument-unknown", `Capabilities does not accept ${unknown}.`);
}

export async function capabilitiesCommand(args: string[], boundary: Boundary,
  resolveIdentity: () => Promise<RuntimeSourceIdentityResolution> = resolveRuntimeSourceIdentity): Promise<number> {
  const json = args.includes("--json") || args.includes("-j");
  const fault = requestFault(args);
  let result: CommandResult;
  if (fault !== undefined) result = newCommandFailure("capabilities", fault, json);
  else {
    const resolved = await resolveIdentity();
    result = resolved.status === "resolved" ? capabilitiesResult(CLI_CONTRACTS, json, resolved.identity)
      : newCommandFailure("capabilities", failure("runtime-identity-unavailable", resolved.reason, 4), json);
  }
  if (result.stdout.length > 0) boundary.stdout(result.stdout);
  if (result.stderr.length > 0) boundary.stderr(result.stderr);
  return result.exit;
}
