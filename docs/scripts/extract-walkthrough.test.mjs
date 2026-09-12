import { readFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import test from 'node:test';
import { GITHUB_REPO, steps } from './walkthrough-steps.mjs';

const run = promisify(execFile);
const docs = dirname(dirname(fileURLToPath(import.meta.url)));
const repository = dirname(docs);
const examples = join(repository, 'examples');

await run(process.execPath, [join(docs, 'scripts', 'extract-walkthrough.mjs')]);
const raw = await readFile(join(docs, 'src', 'data', 'walkthrough.json'), 'utf8');
const data = JSON.parse(raw);

test('every step in the configuration is extracted, in order', () => {
	assert.equal(data.steps.length, steps.length);
	assert.deepEqual(
		data.steps.map((step) => step.id),
		steps.map((step) => step.id),
	);
	assert.deepEqual(
		data.steps.map((step) => step.number),
		steps.map((_, index) => index + 1),
	);
});

test('every file a step names is on disk and carries lines', async () => {
	for (const file of data.files) {
		const info = await stat(join(examples, file.path));
		assert.ok(info.isFile(), `${file.path} is not a file`);
		assert.ok(file.lines.length > 0, `${file.path} has no lines`);
	}
	const paths = new Set(data.files.map((file) => file.path));
	for (const step of data.steps) {
		for (const path of step.tree) assert.ok(paths.has(path), `${path} is not extracted`);
		if (step.kind === 'file') assert.ok(paths.has(step.show), `${step.show} is not extracted`);
	}
});

test('the tree accumulates and never shrinks', () => {
	let previous = [];
	for (const step of data.steps) {
		for (const path of previous) {
			assert.ok(step.tree.includes(path), `step ${step.id} dropped ${path}`);
		}
		assert.equal(step.tree.length, previous.length + step.added.length, `step ${step.id}`);
		for (const path of step.added) {
			assert.ok(step.tree.includes(path), `step ${step.id} does not draw ${path}`);
			assert.ok(!previous.includes(path), `step ${step.id} adds ${path} twice`);
		}
		previous = step.tree;
	}
	assert.equal(previous.length, data.files.length);
});

test('every step explains itself and links a page that exists', async () => {
	for (const step of data.steps) {
		const blurb = step.blurb.map((part) => part.text).join('');
		assert.ok(blurb.length > 40, `step ${step.id} says too little`);
		assert.ok(step.spec.href.startsWith('/'), `step ${step.id} has no specification link`);
		assert.ok(step.spec.label.length > 0, `step ${step.id} has no link label`);
		const slug = step.spec.href.split('#')[0].replace(/^\/|\/$/gu, '');
		const info = await stat(join(docs, 'src', 'content', 'docs', `${slug}.md`));
		assert.ok(info.isFile(), `no page at ${step.spec.href}`);
		assert.ok(step.github.startsWith('https://github.com/'), `step ${step.id} has no source link`);
	}
});

test('nothing the page renders names the folder the assembly sits in', () => {
	const rendered = { ...data, steps: data.steps.map(({ github, ...rest }) => rest) };
	assert.ok(
		!JSON.stringify(rendered).includes('example'),
		'the payload names the folder the assembly sits in',
	);
	for (const step of data.steps) {
		const kind = step.githubIsFile ? 'blob' : 'tree';
		assert.ok(
			step.github.startsWith(`${GITHUB_REPO}/${kind}/main/examples/`),
			`step ${step.id} points somewhere else: ${step.github}`,
		);
	}
});

test('a file link takes blob and a folder link takes tree, so neither redirects', () => {
	for (const step of data.steps) {
		const file = !step.github.endsWith('/');
		assert.equal(step.githubIsFile, file, `step ${step.id} disagrees with its own link`);
		assert.equal(step.github.includes('/blob/main/'), file, step.github);
		assert.equal(step.github.includes('/tree/main/'), !file, step.github);
	}
});

test('the tree is sorted by name at every level', () => {
	const sorted = (paths) =>
		[...paths].sort((a, b) => {
			const left = a.split('/');
			const right = b.split('/');
			for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
				if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
			}
			return left.length - right.length;
		});
	for (const step of data.steps) {
		assert.deepEqual(step.tree, sorted(step.tree), `step ${step.id} draws an unsorted tree`);
	}
	const last = data.steps.at(-1).tree;
	assert.ok(
		last.indexOf('triage/flows/triage/02-route/CHOOSE.md') <
			last.indexOf('triage/flows/triage/03-verify/STAGE.md'),
		'02-route sorts after 03-verify',
	);
});

test('the banner counts and the record count the same stages', () => {
	const resolved = data.check.rows.map((row) => row.stage);
	const walked = data.record.stages.map((stage) => stage.stage);
	assert.equal(data.banner.files, data.files.length);
	assert.equal(data.banner.stageFiles, resolved.length);
	assert.equal(data.banner.stagesWalked, walked.length);
	assert.equal(data.banner.stageFiles, data.banner.stagesWalked + 1);
	assert.deepEqual(
		resolved.filter((stage) => !walked.includes(stage)),
		[data.banner.declined],
	);
	assert.equal(data.banner.declined, '02-route/routine/01-routine');
});

test('a check row can fold its option ladder away', () => {
	for (const row of data.check.rows) {
		assert.ok(row.options.startsWith('options='), row.options);
		assert.ok(!row.head.includes('options='), row.head);
		assert.ok(row.head.startsWith(row.stage), row.head);
	}
	const ladders = new Set(data.check.rows.map((row) => row.options));
	assert.ok(ladders.size < data.check.rows.length, 'no two rows repeat an option ladder');
});

test('the page defines the words it uses', () => {
	const copy = data.steps
		.map((step) => step.blurb.map((part) => part.text).join(''))
		.join(' ');
	for (const word of ['sentinel', 'rung']) {
		assert.ok(!copy.includes(word), `the copy says "${word}" and never defines it`);
	}
});

test('the bot assembly check paste is the five stage rows the assembly resolves to', () => {
	assert.equal(data.check.command, 'bot assembly check ./triage/triage');
	assert.equal(data.check.rows.length, 5);
	assert.deepEqual(
		data.check.rows.map((row) => row.stage),
		['01-classify', '02-route', '02-route/routine/01-routine', '02-route/urgent/01-urgent', '03-verify'],
	);
	for (const row of data.check.rows) {
		assert.match(row.options, /^options=intelligence=default@assembly/u);
	}
	assert.equal(data.check.exit, '0');
});

test('the record opens, closes, and plays its stages in run order', () => {
	assert.equal(data.record.lines, 89);
	assert.equal(data.record.events, 89);
	assert.equal(data.record.exit, 0);
	assert.equal(data.record.flow, 'triage');
	assert.deepEqual(
		data.record.stages.map((stage) => stage.stage),
		['01-classify', '02-route', '02-route/urgent/01-urgent', '03-verify'],
	);
	const first = data.record.stages[0].rows;
	assert.equal(first[0].label, 'hook before');
	assert.equal(first.at(-1).label, 'stage_end success');
	assert.equal(
		data.record.stages.find((stage) => stage.stage === '02-route').rows
			.filter((row) => row.kind === 'chose').length,
		1,
	);
	const gates = data.record.stages
		.at(-1)
		.rows.filter((row) => (row.label ?? '').startsWith('gate '))
		.map((row) => row.label);
	assert.deepEqual(gates, ['gate 01-blocker', 'gate 02-sections']);
	for (const stage of data.record.stages) {
		assert.ok(stage.turns > 0, `${stage.stage} counted no turns`);
		assert.ok(stage.rows.some((row) => row.kind === 'turns'), `${stage.stage} draws no turn row`);
	}
});

test('the ticker accounts for every event in the record', () => {
	const counted =
		data.record.tail +
		data.record.stages.reduce(
			(n, stage) => n + stage.events + stage.rows.reduce((m, row) => m + row.events, 0),
			0,
		);
	assert.equal(counted, data.record.lines);
});

test('prose wraps and machine text does not', () => {
	for (const file of data.files) {
		assert.equal(file.wrap, file.path.endsWith('.md'), `${file.path} wraps wrongly`);
	}
	assert.ok(data.files.some((file) => file.wrap), 'no file wraps');
	assert.ok(data.files.some((file) => !file.wrap), 'every file wraps');
});

test('the record card names what a local run folder holds', () => {
	assert.deepEqual(data.sealed.entries, ['assembly/', 'record.jsonl', 'request.txt', 'stages/']);
	assert.deepEqual(data.sealed.headings, ['Queue', 'Why', 'Action']);
});

test('the payload stays small enough to inline in the home page', () => {
	assert.ok(raw.length < 120 * 1024, `walkthrough.json is ${raw.length} bytes`);
});
