// Build-time extractor for the conformance corpus.
//
// Walks specification/conformance/{accept,refuse}/<case>/ and writes one JSON
// file the browser can import: every case's file tree with contents, the
// invocation line, and the expected output. The corpus is 91 KB of text, so
// the contents ship whole rather than being fetched. Refusal sentences come
// from specification/elements/refusals.md, the only place the spec states the
// fix for a code; the corpus never asserts a sentence.
import { readFile, readdir, mkdir, writeFile, lstat, readlink } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const docs = dirname(dirname(fileURLToPath(import.meta.url)));
const repository = dirname(docs);
const corpus = join(repository, 'specification', 'conformance');
const destination = join(docs, 'src', 'data', 'corpus.json');

/** Files above this size ship without contents. See the planning note. */
const CONTENT_LIMIT = 4096;
/** The JSON must stay small enough to inline in a page bundle. */
const JSON_LIMIT = 400 * 1024;

const decoder = new TextDecoder('utf8', { fatal: true });

async function walk(root, directory = root) {
	const out = [];
	const entries = await readdir(directory, { withFileTypes: true });
	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			out.push(...(await walk(root, path)));
		} else {
			out.push(relative(root, path).replaceAll('\\', '/'));
		}
	}
	return out;
}

async function fileEntry(caseDirectory, path) {
	const absolute = join(caseDirectory, path);
	const info = await lstat(absolute);
	const entry = {
		path,
		size: info.size,
		executable: (info.mode & 0o111) !== 0,
	};
	if (info.isSymbolicLink()) {
		// The corpus carries links, some of them deliberately dangling.
		entry.link = await readlink(absolute);
		entry.omitted = 'link';
		return entry;
	}
	if (info.size > CONTENT_LIMIT) {
		entry.omitted = 'size';
		return entry;
	}
	const bytes = await readFile(absolute);
	try {
		entry.text = decoder.decode(bytes);
	} catch {
		// The corpus carries deliberately invalid bytes (BOM and non-UTF-8
		// cases). Show them, do not pretend they decode.
		entry.omitted = 'bytes';
		entry.bytes = [...bytes.subarray(0, 64)]
			.map((b) => b.toString(16).padStart(2, '0'))
			.join(' ');
	}
	return entry;
}

/** Container stage types. A case that holds one is richer than a flat list. */
const CONTAINERS = new Set(['CHOOSE', 'PARALLEL', 'LOOP', 'FANOUT']);

/** One line a reader can choose by: how big the case is and what it holds. */
function summarize(stages) {
	const parts = [`${stages.length} ${stages.length === 1 ? 'stage' : 'stages'}`];
	const containers = stages
		.map((stage) => stage.type)
		.filter((type) => CONTAINERS.has(type));
	parts.push(...[...new Set(containers)].sort());
	if (stages.some((stage) => (stage.skills ?? []).length > 0)) parts.push('skills');
	const subflows = (stage) =>
		stage.subflow !== undefined || (stage.scope?.subflows ?? []).length > 0;
	if (stages.some(subflows)) parts.push('subflows');
	return parts.join(' \u00b7 ');
}

function parseLines(text) {
	return text.split('\n').filter((line) => line.length > 0);
}

/** Refusal code -> the fault it names, from the spec's tables. */
async function refusalVocabulary() {
	const text = await readFile(
		join(repository, 'specification', 'elements', 'refusals.md'),
		'utf8',
	);
	const codes = {};
	for (const line of text.split('\n')) {
		const row = /^\|\s*`([a-z0-9-]+)`\s*\|\s*(.+?)\s*\|\s*$/.exec(line);
		if (row === null) continue;
		const [, code, fault] = row;
		if (code in codes) continue;
		codes[code] = fault
			.replaceAll(/\[([^\]]+)\]\([^)]+\)/g, '$1')
			.replaceAll('`', '')
			.trim();
	}
	return codes;
}

async function readCase(kind, id) {
	const directory = join(corpus, kind, id);
	const all = await walk(directory);
	const invocation = (await readFile(join(directory, 'invocation'), 'utf8')).trim();
	const expected = parseLines(await readFile(join(directory, 'expected.jsonl'), 'utf8'));
	const tree = [];
	for (const path of all) {
		if (path === 'invocation' || path === 'expected.jsonl') continue;
		tree.push(await fileEntry(directory, path));
	}
	const entry = { id, kind, invocation, files: tree, expected };
	if (kind === 'accept') {
		entry.stages = expected.map((line) => JSON.parse(line));
		entry.summary = summarize(entry.stages);
	} else {
		entry.faults = expected.map((line) => JSON.parse(line));
		entry.codes = [...new Set(entry.faults.map((f) => f.code))].sort();
	}
	return entry;
}

async function main() {
	const codes = await refusalVocabulary();
	const cases = [];
	for (const kind of ['accept', 'refuse']) {
		for (const id of (await readdir(join(corpus, kind))).sort()) {
			cases.push(await readCase(kind, id));
		}
	}

	const unknown = new Set();
	for (const entry of cases) {
		for (const code of entry.codes ?? []) {
			if (!(code in codes)) unknown.add(code);
		}
	}
	if (unknown.size > 0) {
		throw new Error(
			`refusal codes asserted by the corpus with no row in refusals.md: ${[...unknown].sort().join(', ')}`,
		);
	}

	const files = cases.reduce((n, c) => n + c.files.length, 0);
	const bytes = cases.reduce((n, c) => n + c.files.reduce((m, f) => m + f.size, 0), 0);
	const data = {
		counts: {
			cases: cases.length,
			accept: cases.filter((c) => c.kind === 'accept').length,
			refuse: cases.filter((c) => c.kind === 'refuse').length,
			files,
			bytes,
			codes: Object.keys(codes).length,
		},
		codes,
		cases,
	};

	const json = JSON.stringify(data);
	if (json.length > JSON_LIMIT) {
		throw new Error(
			`corpus.json is ${json.length} bytes, over the ${JSON_LIMIT} byte budget`,
		);
	}
	await mkdir(dirname(destination), { recursive: true });
	await writeFile(destination, json, 'utf8');
	process.stdout.write(
		`corpus.json: ${data.counts.cases} cases (${data.counts.accept} accept, ` +
			`${data.counts.refuse} refuse), ${files} files, ${bytes} bytes of corpus, ` +
			`${json.length} bytes of JSON\n`,
	);
}

await main();
