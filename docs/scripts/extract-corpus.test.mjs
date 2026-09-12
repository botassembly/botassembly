import { readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import test from 'node:test';

const run = promisify(execFile);
const docs = dirname(dirname(fileURLToPath(import.meta.url)));
const repository = dirname(docs);
const corpus = join(repository, 'specification', 'conformance');

await run(process.execPath, [join(docs, 'scripts', 'extract-corpus.mjs')]);
const raw = await readFile(join(docs, 'src', 'data', 'corpus.json'), 'utf8');
const data = JSON.parse(raw);

test('every case in the corpus is extracted', async () => {
	const accept = (await readdir(join(corpus, 'accept'))).length;
	const refuse = (await readdir(join(corpus, 'refuse'))).length;
	assert.equal(data.counts.accept, accept);
	assert.equal(data.counts.refuse, refuse);
	assert.equal(data.cases.length, accept + refuse);
});

test('the JSON stays small enough to inline in a page', () => {
	assert.ok(raw.length < 400 * 1024, `corpus.json is ${raw.length} bytes`);
});

test('an accept case carries its invocation and its check lines', () => {
	for (const entry of data.cases.filter((c) => c.kind === 'accept')) {
		assert.ok(entry.invocation.length > 0, `${entry.id} has no invocation`);
		assert.ok(entry.stages.length > 0, `${entry.id} has no stages`);
		assert.ok(entry.files.length > 0, `${entry.id} has no files`);
	}
});

test('every refusal code a refuse case asserts has a repair sentence', () => {
	for (const entry of data.cases.filter((c) => c.kind === 'refuse')) {
		assert.ok(entry.faults.length > 0, `${entry.id} asserts no fault`);
		for (const fault of entry.faults) {
			assert.ok(data.codes[fault.code], `${fault.code} has no row in refusals.md`);
		}
	}
});

test('a file either ships its contents or says why not', () => {
	for (const entry of data.cases) {
		for (const file of entry.files) {
			assert.ok(
				typeof file.text === 'string' || typeof file.omitted === 'string',
				`${entry.id}/${file.path} has neither contents nor a reason`,
			);
		}
	}
});

test('an accept case carries a summary the picker can show', () => {
	for (const entry of data.cases.filter((c) => c.kind === 'accept')) {
		const expected = `${entry.stages.length} ${entry.stages.length === 1 ? 'stage' : 'stages'}`;
		assert.ok(entry.summary.startsWith(expected), `${entry.id}: ${entry.summary}`);
	}
	const nesting = data.cases.find((c) => c.id === 'shape-nesting');
	assert.equal(nesting.summary, '14 stages · CHOOSE · LOOP · PARALLEL');
	const skills = data.cases.find((c) => c.id === 'container-skills');
	assert.ok(skills.summary.endsWith('· skills'), skills.summary);
});
