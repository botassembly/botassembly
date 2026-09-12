// Build-time extractor for the home page walkthrough.
//
// Reads the real assembly under examples/ and a checked event record beside it, and
// writes one JSON file the page imports. Nothing on the page is retyped: the
// file bodies are the files, the `bot assembly check` paste comes out of the assembly's
// own README by fenced block, and the run ticker comes out of record.jsonl.
// A step that names a path with no file on disk fails the build by name.
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	ASSEMBLY,
	CHECK_COMMAND,
	CHECK_SOURCE,
	FLOW,
	GITHUB_REPO,
	RUN,
	RUN_COMMAND,
	steps,
} from './walkthrough-steps.mjs';

const docs = dirname(dirname(fileURLToPath(import.meta.url)));
const repository = dirname(docs);
const root = join(repository, 'examples');
const destination = join(docs, 'src', 'data', 'walkthrough.json');

/** The payload is inlined in the page, so it stays small. */
const JSON_LIMIT = 120 * 1024;
/** An evidence sentence draws on one ticker row and no more. */
const EVIDENCE_LIMIT = 96;

function fail(message) {
	throw new Error(`walkthrough: ${message}`);
}

/** Inline code in a blurb, split so the component needs no markdown parser. */
function blurbParts(step) {
	if (typeof step.blurb !== 'string' || step.blurb.trim() === '') {
		fail(`step "${step.title}" has no explanation`);
	}
	if (step.blurb.includes('example')) {
		fail(`step "${step.title}" names the folder the assembly sits in`);
	}
	return step.blurb
		.split('`')
		.map((text, index) => ({ code: index % 2 === 1, text }))
		.filter((part) => part.text !== '');
}

async function fileEntry(path) {
	const absolute = join(root, path);
	let info;
	try {
		info = await stat(absolute);
	} catch {
		return fail(`${path} is named by a step and is not on disk`);
	}
	const text = await readFile(absolute, 'utf8');
	if (text.trim() === '') fail(`${path} is empty`);
	return {
		path,
		size: info.size,
		executable: (info.mode & 0o111) !== 0,
		// Prose wraps; a script, a schema, and a terminal paste do not.
		wrap: path.endsWith('.md'),
		lines: text.replace(/\n$/u, '').split('\n'),
	};
}

/** Lit line range for a step, resolved from a marker the file must carry. */
function resolveFocus(step, file) {
	if (!step.focus) return undefined;
	const marker = step.focus.until ?? step.focus.from;
	const index = file.lines.findIndex((line) => line.startsWith(marker));
	if (index < 0) fail(`step "${step.title}" focuses on "${marker}", absent from ${file.path}`);
	return step.focus.until ? { start: 0, end: index } : { start: index, end: file.lines.length };
}

/** The `bot assembly check` paste, taken from the assembly README's console block. */
async function checkOutput() {
	const text = await readFile(join(root, CHECK_SOURCE), 'utf8');
	const blocks = [...text.matchAll(/```console\n([\s\S]*?)```/gu)].map((match) => match[1]);
	const block = blocks.find((body) => body.startsWith(`$ ${CHECK_COMMAND}\n`));
	if (block === undefined) fail(`${CHECK_SOURCE} carries no console block for "${CHECK_COMMAND}"`);
	const lines = block.replace(/\n$/u, '').split('\n');
	const printed = lines.slice(1, lines.indexOf('$ echo $?'));
	if (printed.length === 0) fail(`${CHECK_SOURCE} pastes no rows for "${CHECK_COMMAND}"`);
	const rows = printed.map((line) => {
		const at = line.indexOf('  options=');
		if (at < 0) fail(`a check row prints no options: ${line}`);
		return { stage: line.slice(0, line.indexOf('  ')), head: line.slice(0, at), options: line.slice(at + 2) };
	});
	return { command: CHECK_COMMAND, rows, exit: lines.at(-1) };
}

const base = (path) => path.slice(path.lastIndexOf('/') + 1);

/** A folder takes `/tree/`, a file takes `/blob/`. Neither redirects. */
function githubUrl(path) {
	const kind = path.endsWith('/') ? 'tree' : 'blob';
	return `${GITHUB_REPO}/${kind}/main/examples/${path}`;
}

/** Path order the tree draws in: every level sorted by name. */
function sortPaths(paths) {
	return [...paths].sort((a, b) => {
		const left = a.split('/');
		const right = b.split('/');
		for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
			if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
		}
		return left.length - right.length;
	});
}

function trim(sentence) {
	const one = sentence.replaceAll(/\s+/gu, ' ').trim();
	if (one.length <= EVIDENCE_LIMIT) return one;
	const cut = one.slice(0, EVIDENCE_LIMIT - 1);
	const space = cut.lastIndexOf(' ');
	return `${(space > EVIDENCE_LIMIT - 24 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** record.jsonl as the ticker draws it: one card per stage, rows in order. */
function readRecord(text) {
	const lines = text.replace(/\n$/u, '').split('\n');
	const events = lines.map((line) => JSON.parse(line));
	const start = events.find((event) => event.event === 'run_start');
	const end = events.find((event) => event.event === 'run_end');
	if (!start || !end) fail('record.jsonl carries no run_start or no run_end');

	// Every record event is attributed to exactly one thing the ticker draws,
	// so the running count during playback reaches the record's own line
	// count. Events the ticker draws no row for, such as `prompt` and
	// `gate_start`, land on the next row that does draw.
	const stages = [];
	let card;
	let marks = 0;
	let pending = 0;
	let tail = 0;
	const take = () => {
		const events = pending;
		pending = 0;
		return events;
	};
	const push = (row) => {
		if (!card) fail(`an event arrived before any stage started: ${row.label}`);
		card.rows.push({ ...row, events: take() });
	};
	const countTurn = (event) => {
		if (!card) return;
		if (card.turnsRow === undefined) {
			card.turnsRow = { kind: 'turns', events: 0 };
			card.rows.push(card.turnsRow);
		}
		card.turnsRow.events += take();
		if (event.event === 'turn') {
			card.turns += 1;
			card.tokens += event.total ?? 0;
		}
	};

	for (const event of events) {
		pending += 1;
		switch (event.event) {
			case 'stage_start':
				marks = 0;
				card = { stage: event.stage, turns: 0, tokens: 0, events: take(), rows: [] };
				stages.push(card);
				break;
			case 'provider_start':
			case 'turn':
				countTurn(event);
				break;
			case 'hook':
				push({ kind: 'hook', label: `hook ${event.hook}`, exit: event.exit });
				break;
			case 'tool_call':
				if (event.tool === 'mark') {
					marks += 1;
					push({
						kind: 'mark',
						label: `mark item ${String(marks)} ${event.decision}`,
						detail: trim(event.evidence ?? ''),
					});
				}
				break;
			case 'check':
				push({
					kind: 'check',
					label:
						event.check === 'gate'
							? `gate ${base(event.file)}`
							: `check ${event.check}`,
					exit: event.exit,
				});
				break;
			case 'chose':
				push({
					kind: 'chose',
					label: `chose ${event.chose}, declined ${event.declined.join(', ')}`,
					detail: trim(event.reason ?? ''),
				});
				break;
			case 'stage_end':
				push({ kind: 'stage_end', label: `stage_end ${event.cause}`, exit: event.exit });
				break;
			case 'run_end':
				tail = take();
				break;
			default:
				break;
		}
	}
	if (pending !== 0) fail(`${String(pending)} record events reach nothing the ticker draws`);
	for (const stage of stages) {
		delete stage.turnsRow;
		if (stage.rows.length === 0) fail(`stage ${stage.stage} draws no rows`);
	}
	const counted =
		tail + stages.reduce((n, s) => n + s.events + s.rows.reduce((m, r) => m + r.events, 0), 0);
	if (counted !== lines.length) {
		fail(`the ticker accounts for ${String(counted)} of ${String(lines.length)} record events`);
	}

	return {
		run: start.run,
		flow: start.flow,
		lines: lines.length,
		events: events.length,
		request: {
			name: start.request?.name ?? start.request?.path ?? 'request.txt',
			bytes: start.request?.bytes ?? 0,
		},
		stages,
		exit: end.exit,
		cause: end.cause,
		tail,
		rows: stages.reduce((n, stage) => n + stage.rows.length, 0),
	};
}

/** The record card at the end: what a run folder holds and what this run produced. */
async function sealedRun() {
	const entries = ['assembly/', 'record.jsonl', 'request.txt', 'stages/'];
	const output = await readFile(join(root, 'triage-output.txt'), 'utf8');
	const headings = output
		.split('\n')
		.filter((line) => line.startsWith('## '))
		.map((line) => line.slice(3));
	if (headings.length === 0) fail('the run produced no memo headings');
	return { path: 'a local run folder', entries, headings };
}

/** Nothing the page renders names `examples`. A GitHub URL is not rendered. */
function namesTheFolder(value, where) {
	if (typeof value === 'string') return value.includes('example') ? where : undefined;
	if (Array.isArray(value)) {
		for (const [index, item] of value.entries()) {
			const found = namesTheFolder(item, `${where}[${String(index)}]`);
			if (found !== undefined) return found;
		}
		return undefined;
	}
	if (value !== null && typeof value === 'object') {
		for (const [key, item] of Object.entries(value)) {
			if (key === 'github') continue;
			const found = namesTheFolder(item, `${where}.${key}`);
			if (found !== undefined) return found;
		}
	}
	return undefined;
}

async function main() {
	const check = await checkOutput();
	const record = readRecord(await readFile(join(root, RUN), 'utf8'));
	const sealed = await sealedRun();

	const files = new Map();
	const order = [];
	const out = [];
	for (const [index, step] of steps.entries()) {
		for (const path of step.add ?? []) {
			if (files.has(path)) fail(`${path} is added twice, at step ${String(index + 1)}`);
			const entry = await fileEntry(path);
			files.set(path, entry);
			order.push(path);
		}
		const kind = step.kind ?? 'file';
		const shown = order.slice();
		const entry = {
			id: step.id,
			number: index + 1,
			title: step.title,
			kind,
			layout: step.layout ?? 'panes',
			tree: sortPaths(shown),
			added: step.add ?? [],
			blurb: blurbParts(step),
			spec: step.spec,
			github: githubUrl(step.github),
			githubIsFile: !step.github.endsWith('/'),
		};
		if (kind === 'file') {
			const file = files.get(step.show);
			if (file === undefined) fail(`step "${step.title}" shows ${step.show}, not yet added`);
			entry.show = step.show;
			entry.focus = resolveFocus(step, file);
		}
		out.push(entry);
	}

	const walked = record.stages.map((stage) => stage.stage);
	const resolved = check.rows.map((row) => row.stage);
	const declined = resolved.filter((stage) => !walked.includes(stage));
	if (declined.length !== 1) {
		fail(`${String(declined.length)} stage files resolve that the run did not walk, expected one`);
	}

	const data = {
		assembly: ASSEMBLY,
		flow: FLOW,
		// The banner over the wide steps counts from here, and so does the
		// record card, so the two can never disagree.
		banner: {
			files: files.size,
			stageFiles: resolved.length,
			stagesWalked: walked.length,
			declined: declined[0],
		},
		runCommand: RUN_COMMAND,
		files: [...files.values()],
		steps: out,
		check,
		record,
		sealed,
	};

	const json = JSON.stringify(data);
	if (json.length > JSON_LIMIT) {
		fail(`walkthrough.json is ${String(json.length)} bytes, over the ${String(JSON_LIMIT)} byte budget`);
	}
	const named = namesTheFolder(data, '');
	if (named !== undefined) fail(`the payload names the folder the assembly sits in, at ${named}`);
	await mkdir(dirname(destination), { recursive: true });
	await writeFile(destination, json, 'utf8');
	process.stdout.write(
		`walkthrough.json: ${String(out.length)} steps, ${String(files.size)} files, ` +
			`${String(check.rows.length)} check rows, ${String(record.lines)} record lines, ` +
			`${String(record.rows)} ticker rows, ${String(json.length)} bytes of JSON\n`,
	);
}

await main();
