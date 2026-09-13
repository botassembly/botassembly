import type { HashedPath } from "./record-fields.ts";
import type { Cause } from "./spine.ts";

export interface FanoutPlan { item: string; call: number; request_bytes: number; request_sha256: string }
export interface FanoutIdentity { stage: string; retry: number; repeat?: never }

function fanoutFields<Name extends "fanout_start" | "fanout_done">(ts: string, event: Name, identity: FanoutIdentity) {
  return { ts, event, stage: identity.stage, retry: identity.retry };
}

export function fanoutStartEvent(input: {
  ts: string; identity: FanoutIdentity; received: HashedPath; items: string; subflow: string;
  width: number; maxItems: number; manifestBytes: number; manifestSha256: string; plan: FanoutPlan[];
}) {
  return {
    ...fanoutFields(input.ts, "fanout_start", input.identity), received: input.received,
    items: input.items, subflow: input.subflow, width: input.width, max_items: input.maxItems,
    manifest_bytes: input.manifestBytes, manifest_sha256: input.manifestSha256, plan: input.plan,
  };
}

export function fanoutDoneEvent(input: {
  ts: string; identity: FanoutIdentity; exit: number; cause: Cause; concurrent: number; selected?: string;
}) {
  return {
    ...fanoutFields(input.ts, "fanout_done", input.identity), exit: input.exit, cause: input.cause,
    concurrent: input.concurrent, ...(input.selected === undefined ? {} : { selected: input.selected }),
  };
}
