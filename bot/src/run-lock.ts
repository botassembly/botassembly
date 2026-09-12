import * as fs from "node:fs";
import { lockSync } from "proper-lockfile";
import { RUN_LOCK } from "./inspection.ts";
import { runLockCompromised } from "./model.ts";

export interface ActiveRunLock { release(): void; compromised: Promise<never> }

/** A live run holder observes proper-lockfile's successful heartbeats through
 * an injected monotonic clock, never the agent clock that pauses around child work. */
export function lockActiveRun(directory: string, monotonic: () => number): ActiveRunLock {
  let heartbeat: number | undefined;
  let compromisedLock = false;
  let rejectCompromise = (_reason: Error): void => undefined;
  const compromised = new Promise<never>((_resolve, reject) => { rejectCompromise = reject; });
  void compromised.catch(() => undefined);
  const monitoredFs = {
    ...fs,
    utimesSync(path: fs.PathLike, atime: string | number | Date, mtime: string | number | Date): void {
      fs.utimesSync(path, atime, mtime);
      if (heartbeat !== undefined) heartbeat = monotonic();
    },
  };
  const releaseLock = lockSync(directory, {
    ...RUN_LOCK,
    fs: monitoredFs,
    onCompromised: (cause: Error) => {
      compromisedLock = true;
      const detected = monotonic();
      rejectCompromise(runLockCompromised(directory, heartbeat === undefined ? 0 : detected - heartbeat, cause));
    },
  });
  heartbeat = monotonic();
  return { release: () => { if (!compromisedLock) releaseLock(); }, compromised };
}
