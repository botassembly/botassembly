import { isAbsolute } from "node:path";
import { mapping } from "./model.ts";

const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const positiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 1;

export function normalizedRunPath(path: string): boolean {
  return path.length > 0 && !isAbsolute(path) && !path.includes("\\")
    && path.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

export function normalizedWorkdir(path: string): boolean {
  return path === "." || normalizedRunPath(path);
}

export interface RetainedRequestFact { path: string; sha256: string; bytes: number }

export function retainedRequestFact(value: unknown): RetainedRequestFact | undefined {
  if (!mapping(value)) return undefined;
  const path = value["path"], sha256 = value["sha256"], bytes = value["bytes"];
  if (typeof path !== "string" || !normalizedRunPath(path) || !hash(sha256)) return undefined;
  return typeof bytes === "number" && Number.isSafeInteger(bytes) && bytes >= 0 ? { path, sha256, bytes } : undefined;
}

export interface SealFact { path: string; sha256: string }

function sealFact(value: unknown): SealFact | undefined {
  if (!mapping(value)) return undefined;
  const path = value["path"], sha256 = value["sha256"];
  return typeof path === "string" && normalizedRunPath(path) && hash(sha256) ? { path, sha256 } : undefined;
}

function latestDisposition(events: Record<string, unknown>[], stage: string | undefined): Record<string, unknown> | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.["event"] === "stage_end" && (stage === undefined || event["stage"] === stage)) return event;
  }
  return undefined;
}

export function sealedOutput(events: Record<string, unknown>[], stage: string | undefined): SealFact | undefined {
  const event = latestDisposition(events, stage);
  return event?.["exit"] === 0 && event["cause"] === "success" && event["sealed"] === true && event["judged"] === true
    ? sealFact(event["output"])
    : undefined;
}

export function refusedDraft(events: Record<string, unknown>[], stage: string): SealFact | undefined {
  const event = latestDisposition(events, stage);
  return event?.["exit"] === 1 && event["cause"] === "refused" && event["sealed"] === false && event["judged"] === false
    ? sealFact(event["output"])
    : undefined;
}

export function judgedRejection(events: Record<string, unknown>[], stage: string): SealFact | undefined {
  const event = latestDisposition(events, stage);
  return event?.["exit"] === 1 && (event["cause"] === "rejected" || event["cause"] === "exhausted")
    && event["sealed"] === false && event["judged"] === true
    ? sealFact(event["output"])
    : undefined;
}

export type CheckFact = { capture: string; sha256?: string } | "failed";

function checkIdentity(event: Record<string, unknown>): boolean {
  const stage = event["stage"], repeat = event["repeat"];
  return typeof stage === "string" && stage.length > 0 && positiveInteger(event["retry"])
    && (repeat === undefined || positiveInteger(repeat));
}

function checkArtifact(event: Record<string, unknown>): { capture: string; sha256?: string } | undefined {
  const capture = event["capture"], sha256 = event["sha256"];
  if (typeof capture !== "string" || !normalizedRunPath(capture)) return undefined;
  if (sha256 !== undefined && !hash(sha256)) return undefined;
  return { capture, ...(sha256 === undefined ? {} : { sha256 }) };
}

export function checkFact(event: Record<string, unknown>): CheckFact | undefined {
  if (!checkIdentity(event)) return undefined;
  if (typeof event["exit"] !== "number" && event["exit"] !== null) return undefined;
  const artifact = checkArtifact(event);
  if (artifact === undefined) return undefined;
  if (event["exit"] !== 0) return "failed";
  return artifact;
}

export function malformedSession(event: Record<string, unknown>, requireStage = true): boolean {
  const stage = event["stage"], session = event["session"];
  return requireStage && (typeof stage !== "string" || stage.length === 0)
    || typeof session !== "string" || !normalizedRunPath(session);
}
