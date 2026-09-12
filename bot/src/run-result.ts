import type { FlowResult, FlowSource } from "./execution.ts";
import type { RunEndEvent, RunStartEvent, StageIdentity } from "./record-events.ts";
import type { Cause, Refusal } from "./spine.ts";

export type RunOutcome = { exitCode: number; cause: Cause; reason?: string; output?: Buffer };
type UnstartedRunResult = RunOutcome | { exitCode: 2; faults: Refusal[] };

export interface StartedRunResult extends RunOutcome {
  run: string;
  startedAt: string;
  installationId: string;
  ending?: RunEndEvent;
  terminalStage?: StageIdentity;
  outputSource?: FlowSource;
  correlation?: string;
  donor?: string;
  carried?: StageIdentity[];
}

export type RunCommandResult = UnstartedRunResult | StartedRunResult;

export function startedResult(start: RunStartEvent, result: Omit<StartedRunResult, "run" | "startedAt" | "installationId" | "correlation">): StartedRunResult {
  if (start.installation_id === undefined) throw new TypeError("A current run_start event omitted its installation identity.");
  return { ...result, run: start.run, startedAt: start.ts, installationId: start.installation_id,
    ...(start.correlation === undefined ? {} : { correlation: start.correlation }) };
}

export function flowOutcome(result: FlowResult): RunOutcome & Pick<StartedRunResult, "ending" | "terminalStage" | "outputSource"> {
  const terminalStage = result.ending?.stage === undefined || result.ending.retry === undefined ? undefined : {
    stage: result.ending.stage, ...(result.ending.repeat === undefined ? {} : { repeat: result.ending.repeat }), retry: result.ending.retry,
  };
  return {
    exitCode: result.exit, cause: result.cause,
    ...(result.reason === undefined ? {} : { reason: result.reason }),
    ...(result.outputBytes === undefined ? {} : { output: result.outputBytes }),
    ...(result.ending === undefined ? {} : { ending: result.ending }),
    ...(result.output === undefined ? {} : { outputSource: result.output }),
    ...(terminalStage === undefined ? {} : { terminalStage }),
  };
}
