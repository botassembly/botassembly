// Small, deterministic readers for the facts S6 compares. The live validator
// uses these same readers so a changed JSON shape fails before a later claim
// can accidentally pass.

const LIST_KEYS = ["schemaVersion", "kind", "data", "page", "summary", "warnings"];
const FULL_FIELDS = ["id", "assembly", "flow", "startedAt", "endedAt", "duration", "state", "exit", "cause", "tokens"];

function sameKeys(value, keys) {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function duplicateKeys(source) {
  const stack = [];
  for (let at = 0; at < source.length; at += 1) {
    const character = source[at];
    if (character === "{") { stack.push(new Set()); continue; }
    if (character === "}") { stack.pop(); continue; }
    if (character !== '"') continue;
    let end = at + 1;
    for (; end < source.length; end += 1) {
      if (source[end] === '"' && source[end - 1] !== "\\") break;
    }
    const after = source.slice(end + 1).match(/^\s*:/u);
    const object = stack.at(-1);
    if (after !== null && object !== undefined) {
      let key;
      try { key = JSON.parse(source.slice(at, end + 1)); } catch { return true; }
      if (object.has(key)) return true;
      object.add(key);
    }
    at = end;
  }
  return false;
}

export function runList(output, fields, expectedRun) {
  try {
    if (duplicateKeys(output)) return { error: "run list contains a repeated JSON key" };
    const document = JSON.parse(output);
    if (document === null || typeof document !== "object" || !sameKeys(document, LIST_KEYS)
      || document.schemaVersion !== 1 || document.kind !== "bot.run.list" || !Array.isArray(document.data)) {
      return { error: "run list has the wrong document shape" };
    }
    const rows = document.data;
    if (!rows.every((row) => row !== null && typeof row === "object" && sameKeys(row, fields))) {
      return { error: `run list rows must have exactly ${fields.join(", ")} keys` };
    }
    if (fields.length === 2 && fields[0] === "id" && fields[1] === "tokens"
      && !rows.every((row) => typeof row.id === "string" && Number.isSafeInteger(row.tokens) && row.tokens > 0)) {
      return { error: "run list token rows must use positive numeric token totals" };
    }
    if (fields.length === FULL_FIELDS.length && sameKeys({ ...Object.fromEntries(FULL_FIELDS.map((name) => [name, null])) }, fields)
      && !rows.every((row) => typeof row.id === "string"
        && (typeof row.assembly === "string" || row.assembly === null)
        && (typeof row.flow === "string" || row.flow === null)
        && (typeof row.startedAt === "string" || row.startedAt === null)
        && (typeof row.endedAt === "string" || row.endedAt === null)
        && (Number.isSafeInteger(row.duration) || row.duration === null)
        && typeof row.state === "string"
        && (Number.isSafeInteger(row.exit) || row.exit === null)
        && (typeof row.cause === "string" || row.cause === null)
        && (Number.isSafeInteger(row.tokens) || row.tokens === null))) {
      return { error: "run list full rows contain a value with the wrong type" };
    }
    if (expectedRun !== undefined) {
      const matches = rows.filter((row) => row.id === expectedRun);
      if (matches.length !== 1) return { error: `run list must contain exactly one row for ${expectedRun}` };
    }
    return { document, rows };
  } catch {
    return { error: "run list did not return one JSON document" };
  }
}

export function recordLines(output) {
  try {
    const lines = output.split("\n").filter((line) => line.length > 0);
    const events = lines.map((line) => JSON.parse(line));
    return events.every((event) => event !== null && typeof event === "object")
      ? { events } : { error: "run record contains a non-object event" };
  } catch {
    return { error: "run record is not JSONL" };
  }
}
