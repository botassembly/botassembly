// Record-1 compatibility vocabulary that current writers no longer produce.
// Keep this separate from record-events.ts so old evidence remains readable
// without offering retired events to new writer call sites.
const OPERATIONS = new Set(["read", "write", "edit", "bash"]);

export type LegacyRecordEventName = "tool_denied";

export function isLegacyRecordEventName(value: unknown): value is LegacyRecordEventName {
  return value === "tool_denied";
}

function text(value: unknown): boolean {
  return typeof value === "string" && value.length > 0;
}

function historicalAccess(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.entries(value).every(([operation, names]) => OPERATIONS.has(operation)
    && Array.isArray(names) && names.every(text));
}

export function legacyRecordFieldRule(event: Record<string, unknown>): string | undefined {
  if (event["event"] === "stage_start" && event["access"] !== undefined && !historicalAccess(event["access"])) {
    return "stage_start has malformed historical access";
  }
  if (event["event"] === "tool_denied" && (!text(event["tool"]) || !text(event["boundary"]))) {
    return "tool_denied requires tool and boundary";
  }
  return undefined;
}
