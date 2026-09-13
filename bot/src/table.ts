import { plainly } from "./model.ts";

const MAGNITUDES = ["", "K", "M", "B", "T"] as const;
const BYTE_MAGNITUDES = ["", "K", "M", "G", "T"] as const;

function decimalMagnitude(value: number, labels: readonly string[], separator = ""): string {
  if (value < 1_000) return `${String(value)}${separator}${labels[0] ?? ""}`;
  let magnitude = Math.min(Math.floor(Math.log10(value) / 3), labels.length - 1);
  let rounded = Math.round(value / (1_000 ** magnitude) * 10) / 10;
  if (rounded >= 1_000 && magnitude < labels.length - 1) {
    magnitude += 1;
    rounded = Math.round(value / (1_000 ** magnitude) * 10) / 10;
  }
  return `${String(rounded)}${separator}${labels[magnitude] ?? ""}`;
}

/** Render a nonnegative quantity in stable decimal magnitude units. */
export function compactMagnitude(value: number): string {
  return decimalMagnitude(value, MAGNITUDES);
}

/** Render a nonnegative byte count in stable decimal SI units. */
export function byteMagnitude(value: number): string {
  return `${decimalMagnitude(value, BYTE_MAGNITUDES, " ")}B`;
}

/** Render a timestamp's largest whole elapsed unit at a fixed reading time. */
export function elapsedAge(startedAt: string, readingAt: string): string {
  const started = Date.parse(startedAt);
  const read = Date.parse(readingAt);
  if (!Number.isFinite(started) || !Number.isFinite(read)) return "-";
  const seconds = Math.floor(Math.max(0, read - started) / 1_000);
  if (seconds < 60) return `${String(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${String(hours)}h` : `${String(Math.floor(hours / 24))}d`;
}

export interface TableColumn {
  label: string;
  align?: "left" | "right";
}

/** Align reading rows without shortening any cell. */
export function renderRows(columns: readonly TableColumn[], rows: readonly (readonly string[])[], padding = " "): string[] {
  const held = rows.map((row) => row.map(plainly));
  const widths = columns.map((_, at) => Math.max(...held.map((row) => (row[at] ?? "").length)));
  return held.map((row) => columns.map((column, at) => {
    const cell = row[at] ?? "";
    return column.align === "right" ? cell.padStart(widths[at] ?? 0, padding) : cell.padEnd(widths[at] ?? 0, padding);
  }).join("  ").trimEnd());
}

/** Render a labeled, aligned reading table without shortening any cell. */
export function renderTable(columns: readonly TableColumn[], rows: readonly (readonly string[])[]): string[] {
  return renderRows(columns, [columns.map(({ label }) => label), ...rows]);
}
