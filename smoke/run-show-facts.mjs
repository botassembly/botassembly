import { dirname } from "node:path";

const ROOT_KEYS = ["schemaVersion", "kind", "data", "summary", "warnings"];
const DATA_KEYS = ["state", "run", "startedAt", "endedAt", "exit", "cause", "stages", "subflows"];
const STAGE_KEYS = ["identity", "stage", "repeat", "attempt", "state", "exit", "cause", "scratch"];
const SUBFLOW_KEYS = ["caller", "attempt", "call", "subflow", "item", "started", "child", "exit", "cause"];

const error = (message) => ({ error: message });
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const keys = (value, expected, name) => {
	if (!object(value)) return `${name} must be an object`;
	const actual = Object.keys(value);
	return actual.length === expected.length && expected.every((key) => actual.includes(key))
		? undefined : `${name} keys are not exactly ${expected.join(", ")}`;
};
const text = (value, name, nullable = false) => (typeof value === "string" && value.length > 0) || (nullable && value === null)
	? undefined : `${name} must be ${nullable ? "a string or null" : "a non-empty string"}`;
const integer = (value, name, nullable = false) => (Number.isSafeInteger(value) && value >= 1) || (nullable && value === null)
	? undefined : `${name} must be ${nullable ? "a positive integer or null" : "a positive integer"}`;
const outcome = (value, name) => Number.isSafeInteger(value) && value >= 0 || value === null
	? undefined : `${name} must be a non-negative integer or null`;

function repeatedKey(source) {
	const stack = [];
	for (let at = 0; at < source.length; at += 1) {
		const character = source[at];
		if (character === '"') {
			const start = at;
			let slashes = 0;
			for (at += 1; at < source.length; at += 1) {
				const held = source[at];
				if (held === "\\") { slashes += 1; continue; }
				if (held === '"' && slashes % 2 === 0) break;
				slashes = 0;
			}
			const end = at;
			let after = end + 1;
			while (/\s/u.test(source[after] ?? "")) after += 1;
			if (source[after] === ":" && stack.at(-1) instanceof Set) {
				let key;
				try { key = JSON.parse(source.slice(start, end + 1)); } catch { return true; }
				const held = stack.at(-1);
				if (held.has(key)) return true;
				held.add(key);
			}
			continue;
		}
		if (character === "{") stack.push(new Set());
		else if (character === "[") stack.push(null);
		else if (character === "}" || character === "]") stack.pop();
	}
	return false;
}

function stageFacts(value, index) {
	const prefix = `stage ${String(index)}`;
	const shape = keys(value, STAGE_KEYS, prefix);
	if (shape !== undefined) return shape;
	for (const [field, nullable] of [["identity", false], ["stage", false], ["state", false], ["cause", true], ["scratch", true]]) {
		const issue = text(value[field], `${prefix}.${field}`, nullable);
		if (issue !== undefined) return issue;
	}
	for (const [field, nullable] of [["repeat", true], ["attempt", false]]) {
		const issue = integer(value[field], `${prefix}.${field}`, nullable);
		if (issue !== undefined) return issue;
	}
	const issue = outcome(value.exit, `${prefix}.exit`);
	return issue ?? undefined;
}

function subflowFacts(value, index) {
	const prefix = `subflow ${String(index)}`;
	const shape = keys(value, SUBFLOW_KEYS, prefix);
	if (shape !== undefined) return shape;
	for (const [field, nullable] of [["caller", false], ["subflow", false], ["item", true], ["child", true], ["cause", true]]) {
		const issue = text(value[field], `${prefix}.${field}`, nullable);
		if (issue !== undefined) return issue;
	}
	for (const [field, nullable] of [["attempt", false], ["call", false]]) {
		const issue = integer(value[field], `${prefix}.${field}`, nullable);
		if (issue !== undefined) return issue;
	}
	if (typeof value.started !== "boolean") return `${prefix}.started must be a boolean`;
	return outcome(value.exit, `${prefix}.exit`);
}

export function parseRunShow(source, selectedRun) {
	if (typeof source !== "string") return error("run show result must be JSON text");
	if (repeatedKey(source)) return error("run show result contains a repeated JSON key");
	let value;
	try { value = JSON.parse(source); } catch { return error("run show result is not valid JSON"); }
	let issue = keys(value, ROOT_KEYS, "root");
	if (issue !== undefined) return error(issue);
	if (value.schemaVersion !== 1) return error("run show schema must be version 1");
	if (value.kind !== "bot.run.show") return error("run show kind is not bot.run.show");
	if (!object(value.summary) || !Array.isArray(value.warnings)) return error("run show summary or warnings has the wrong type");
	issue = keys(value.data, DATA_KEYS, "data");
	if (issue !== undefined) return error(issue);
	for (const [field, nullable] of [["run", false], ["state", false], ["startedAt", true], ["endedAt", true], ["cause", true]]) {
		issue = text(value.data[field], `data.${field}`, nullable);
		if (issue !== undefined) return error(issue);
	}
	issue = outcome(value.data.exit, "data.exit");
	if (issue !== undefined) return error(issue);
	if (!Array.isArray(value.data.stages) || !Array.isArray(value.data.subflows)) return error("data stages or subflows has the wrong type");
	for (const [index, stage] of value.data.stages.entries()) {
		issue = stageFacts(stage, index);
		if (issue !== undefined) return error(issue);
	}
	for (const [index, subflow] of value.data.subflows.entries()) {
		issue = subflowFacts(subflow, index);
		if (issue !== undefined) return error(issue);
	}
	if (selectedRun !== undefined && value.data.run !== selectedRun) return error("run show selected run does not match the requested run");
	return value;
}

export function scratchRoot(value) {
	if (value?.error !== undefined) return value;
	const roots = new Set(value?.data?.stages?.filter((stage) => stage.scratch !== null).map((stage) => dirname(stage.scratch)) ?? []);
	if (roots.size === 0) return error("run show result contains no scratch root");
	if (roots.size !== 1) return error("run show result contains conflicting scratch roots");
	return roots.values().next().value;
}
