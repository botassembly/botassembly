import { performance } from "node:perf_hooks";
import type { DriverClock } from "./process.ts";

interface Clearable { clear(): void }
function clearable(value: unknown): value is Clearable {
  return typeof value === "object" && value !== null && "clear" in value && typeof value.clear === "function";
}

/** The process composition boundary's real clock. Runtime owners receive the
 * interface and tests can replace every observation and timer. */
export function processClock(): DriverClock {
  return {
    milliseconds: () => performance.now(),
    timestamp: () => new Date().toISOString(),
    setTimeout(callback, milliseconds) {
      const timer = setTimeout(callback, milliseconds);
      return { clear: () => { clearTimeout(timer); } };
    },
    clearTimeout(handle) { if (clearable(handle)) handle.clear(); },
  };
}
