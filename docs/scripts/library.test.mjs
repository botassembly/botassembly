import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLI_CONTRACTS } from '../../bot/src/cli-contract.ts';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const page = join(root, 'docs/src/content/docs/reference/library.md');
const manifest = join(root, 'bot/package.json');

const operations = {
	'./admin-readings': ['assembly.check', 'assembly.list', 'capabilities', 'home.busy', 'home.show', 'intelligence.list'],
	'./inspection': [],
	'./mutation-readings': ['assembly.install', 'assembly.link', 'assembly.remove', 'assembly.update', 'auth.import', 'auth.login', 'auth.logout', 'run.resume', 'run.start'],
	'./one-run': ['run.session'],
	'./record-lines': [],
	'./run-readings': ['run.check', 'run.checklist', 'run.events', 'run.list', 'run.output', 'run.record', 'run.request', 'run.search', 'run.show'],
	'./session': [],
};

test('the library table matches package exports and command schemas', async () => {
	const body = await readFile(page, 'utf8');
	const packageJson = JSON.parse(await readFile(manifest, 'utf8'));
	const rows = new Map([...body.matchAll(/^\| `bot\/([^`]+)` \|[^\n]*\| ([^\n]*) \|$/gmu)]
		.map((match) => [`./${match[1]}`, match[2]]));
	assert.deepEqual([...rows.keys()], Object.keys(packageJson.exports));
	assert.deepEqual([...rows.keys()], Object.keys(operations));

	const contracts = new Map(CLI_CONTRACTS.map((entry) => [entry.operation, entry.output]));
	for (const [path, names] of Object.entries(operations)) {
		const cell = rows.get(path);
		assert.ok(cell);
		if (names.length === 0) {
			assert.equal(cell, 'no command-document schema');
			continue;
		}
		const documented = [...cell.matchAll(/`([^` ]+) → ([^`]+)`/gu)].map((match) => [match[1], match[2]]);
		assert.deepEqual(documented.map(([name]) => name), names);
		for (const [name, schema] of documented) {
			const output = contracts.get(name);
			assert.ok(output, `${name} is absent from CLI_CONTRACTS`);
			const expected = output.kind === 'raw' ? 'raw' : `${output.kind}@${String(output.schemaVersion)}`;
			assert.equal(schema, expected, `${path} ${name}`);
		}
	}
	assert.equal(body.includes('auth.list'), false);
	assert.equal(body.includes('model.list'), false);
});
