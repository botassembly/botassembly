import type { Writable } from "node:stream";
import { output } from "./inspection.ts";
import { errorCode, plainly } from "./model.ts";
import { childReference, openRunDirectory } from "./one-run.ts";
import { heldRecord } from "./record-lines.ts";
import { copyHeldRunFile, type CopiedRunFile } from "./run-files.ts";

function matchingChildIdentity(event: Record<string, unknown>, child: string): boolean {
  const stage = event["stage"], repeat = event["repeat"] ?? 1, retry = event["retry"], call = event["call"];
  return typeof stage === "string" && typeof repeat === "number" && typeof retry === "number" && typeof call === "number"
    && Number.isSafeInteger(repeat) && Number.isSafeInteger(retry) && Number.isSafeInteger(call)
    && `stages/${stage}/${String(repeat)}/${String(retry)}/subflows/${String(call)}` === child;
}

function authorizedChild(event: Record<string, unknown>, child: string): boolean {
  return event["event"] === "subflow_call" && event["started"] === true && event["child"] === child
    && matchingChildIdentity(event, child);
}

function rawUnavailable(copied: CopiedRunFile): string {
  if (copied.kind === "interrupted") {
    const labels = { read: "input read", write: "stdout delivery", close: "descriptor close" };
    const code = errorCode(copied.error);
    const cause = code !== undefined && /^[A-Z0-9_]{1,32}$/u.test(code) ? ` (${code})` : "";
    return `The raw record copy was interrupted during ${labels[copied.phase]}${cause}.`;
  }
  if (copied.kind === "non-file") return "The selected record is not a regular file.";
  if (copied.kind === "missing" || copied.kind === "dangling-link") return "The selected record is unavailable.";
  return "The selected record cannot be read safely.";
}

function unavailable(stderr: (bytes: string | Uint8Array) => void): number {
  stderr("The recorded child is unavailable.\n");
  return 1;
}

async function rawPath(directory: string, child: string | undefined): Promise<string | undefined> {
  if (child === undefined) return "record.jsonl";
  if (!childReference(child)) return undefined;
  const parent = await heldRecord(directory);
  const authorizations = parent?.classification === "valid"
    ? parent.events.filter((event) => authorizedChild(event, child)) : [];
  return authorizations.length === 1 ? `${child}/record.jsonl` : undefined;
}

/** Stream a record snapshot without parsing or endorsing its bytes. A child path first earns
 * authorization from one valid parent fact. The child record itself remains forensic evidence. */
export async function inspectRawShow(
  home: string, prefix: string, child: string | undefined,
  stdout: () => Writable, stderr: (bytes: string | Uint8Array) => void,
): Promise<number> {
  const selected = await openRunDirectory(home, prefix);
  if ("failed" in selected) {
    if (selected.failed.diagnostics !== undefined) stderr(output(selected.failed.diagnostics.map(plainly)));
    return 1;
  }
  const path = await rawPath(selected.directory, child);
  if (path === undefined) return unavailable(stderr);
  const copied = await copyHeldRunFile(selected.directory, path, stdout);
  if (copied.kind === "copied") return 0;
  stderr(`${rawUnavailable(copied)}\n`);
  return 1;
}
