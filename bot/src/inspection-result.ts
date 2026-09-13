import { output as lines, type InspectionResult } from "./inspection.ts";
import { plainly } from "./model.ts";

interface Boundary {
  stdout(bytes: string | Uint8Array): void;
  stderr(bytes: string | Uint8Array): void;
}

export function writeInspection(boundary: Boundary, held: InspectionResult): number {
  if (held.output.length > 0) boundary.stdout(held.output);
  if (held.diagnostics !== undefined && held.diagnostics.length > 0) {
    boundary.stderr(lines(held.diagnostics.map(plainly)));
  }
  return held.exitCode;
}
