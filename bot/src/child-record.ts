import { basename, join } from "node:path";
import type { HeldRecord } from "./record-lines.ts";
import { mapping } from "./model.ts";
import { hashBytes } from "./record.ts";
import { heldRunFile } from "./run-files.ts";

function normalizedRequest(reference: string, input: Record<string, unknown>): string | undefined {
  if (typeof input["text"] === "string") return "request.txt";
  const prefix = `${reference}/`;
  return typeof input["path"] === "string" && input["path"].startsWith(prefix)
    ? input["path"].slice(prefix.length) : undefined;
}

function parentInputAgrees(input: Record<string, unknown>): boolean {
  if (typeof input["text"] !== "string") return true;
  return input["bytes"] === Buffer.byteLength(input["text"]) && input["sha256"] === hashBytes(input["text"]);
}

function requestDescriptorsAgree(request: Record<string, unknown>, input: Record<string, unknown>, normalized: string): boolean {
  return parentInputAgrees(input) && request["path"] === normalized
    && request["sha256"] === input["sha256"] && request["bytes"] === input["bytes"];
}

function startAgrees(reference: string, parent: Record<string, unknown>, started: Record<string, unknown> | undefined): boolean {
  const request = started?.["request"], input = parent["input"];
  const normalized = mapping(input) ? normalizedRequest(reference, input) : undefined;
  return started?.["run"] === basename(reference)
    && started["flow"] === parent["flow"]
    && mapping(request) && request["via"] === "subflow"
    && mapping(input) && typeof normalized === "string" && requestDescriptorsAgree(request, input, normalized);
}

async function requestAgrees(
  directory: string, reference: string, parent: Record<string, unknown>, started: Record<string, unknown> | undefined,
): Promise<boolean> {
  const request = started?.["request"], input = parent["input"];
  if (!mapping(request) || !mapping(input) || typeof request["path"] !== "string") return false;
  const held = await heldRunFile(join(directory, ...reference.split("/")), request["path"]);
  if (held.kind !== "held") return false;
  const sha256 = hashBytes(held.bytes);
  return held.size === request["bytes"] && held.size === input["bytes"]
    && sha256 === request["sha256"] && sha256 === input["sha256"];
}

function ordinaryAgreement(
  parent: Record<string, unknown>, child: HeldRecord, ending: Record<string, unknown> | undefined,
): boolean {
  return child.classification === "valid"
    && ending?.["exit"] === parent["exit"]
    && ending?.["cause"] === parent["cause"];
}

function machineryAgreement(parent: Record<string, unknown>, child: HeldRecord): boolean {
  return parent["exit"] === undefined
    && parent["cause"] === undefined
    && child.classification === "incomplete";
}

export async function childRecordAgrees(
  directory: string, reference: string, parent: Record<string, unknown>, child: HeldRecord,
): Promise<boolean> {
  const started = child.events.find((event) => event["event"] === "run_start");
  if (!startAgrees(reference, parent, started) || !await requestAgrees(directory, reference, parent, started)) return false;
  const ending = child.events.find((event) => event["event"] === "run_end");
  return typeof parent["exit"] === "number" && typeof parent["cause"] === "string"
    ? ordinaryAgreement(parent, child, ending)
    : machineryAgreement(parent, child);
}
