const HEADING = /^#{1,6}(?:[ \t]+|$)/;
const TOP_LEVEL_ITEM = /^(?:[-+*][ \t]+|\d+[.)][ \t]+)/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

function proseLines(body: string): string[] {
  let fence: string | undefined;
  return body.split(/\r?\n/).filter((line) => {
    const marker = FENCE.exec(line)?.[1];
    if (fence !== undefined) {
      if (marker !== undefined && marker[0] === fence[0] && marker.length >= fence.length
        && line.slice(line.indexOf(marker) + marker.length).trim() === "") fence = undefined;
      return false;
    }
    if (marker === undefined) return true;
    fence = marker;
    return false;
  });
}

// The heading is valid at any level (ruled 2026-08-25): 1-6 hashes whose text,
// whitespace-trimmed, is exactly the word `Checklist` — case-sensitive.
function isChecklistHeading(line: string): boolean {
  const match = HEADING.exec(line);
  return match !== null && line.slice(match[0].length).trim() === "Checklist";
}

function sectionLines(body: string, heading: (line: string) => boolean): string[] {
  const lines = proseLines(body);
  const start = lines.findIndex(heading);
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && HEADING.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

/** Top-level Markdown list items beneath the `Checklist` heading. */
export function extractChecklist(body: string): string[] {
  const items: string[] = [];
  let held: string[] = [];
  for (const line of sectionLines(body, isChecklistHeading)) {
    const match = TOP_LEVEL_ITEM.exec(line);
    if (match !== null) {
      if (held.length > 0) items.push(held.join("\n").trimEnd());
      held = [line.slice(match[0].length)];
    } else if (held.length > 0) {
      held.push(line);
    }
  }
  if (held.length > 0) items.push(held.join("\n").trimEnd());
  return items;
}

/** Code spans starting top-level list items in a CHOOSE prompt. */
export function extractAlternatives(body: string): string[] {
  const alternatives: string[] = [];
  for (const line of proseLines(body)) {
    const item = TOP_LEVEL_ITEM.exec(line);
    if (item === null) continue;
    const name = /^`([^`]+)`/.exec(line.slice(item[0].length));
    if (name?.[1] !== undefined) alternatives.push(name[1]);
  }
  return alternatives;
}
