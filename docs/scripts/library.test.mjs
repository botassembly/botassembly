import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLI_CONTRACTS } from '../../bot/src/cli-contract.ts';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const page = join(root, 'docs/src/content/docs/reference/library.md');
const manifest = join(root, 'bot/package.json');

const excludedOperations = new Set(['auth.list', 'model.list']);

function packagePath(contract) {
	if (excludedOperations.has(contract.operation)) return undefined;
	if (contract.operation === 'run.session') return './one-run';
	if (contract.mutates) return './mutation-readings';
	if (contract.operation.startsWith('run.')) return './run-readings';
	return './admin-readings';
}

test('the library table matches package exports and command schemas', async () => {
	const body = await readFile(page, 'utf8');
	const packageJson = JSON.parse(await readFile(manifest, 'utf8'));
	const rows = new Map([...body.matchAll(/^\| `bot\/([^`]+)` \|[^\n]*\| ([^\n]*) \|$/gmu)]
		.map((match) => [`./${match[1]}`, match[2]]));
	assert.deepEqual([...rows.keys()], Object.keys(packageJson.exports));
	const operations = new Map([...rows.keys()].map((path) => [path, []]));
	for (const contract of CLI_CONTRACTS) {
		const path = packagePath(contract);
		if (path !== undefined) operations.get(path)?.push(contract.operation);
	}
	assert.deepEqual([...excludedOperations], CLI_CONTRACTS.filter((contract) => packagePath(contract) === undefined).map((contract) => contract.operation));

	const contracts = new Map(CLI_CONTRACTS.map((entry) => [entry.operation, entry.output]));
	for (const [path, names] of operations) {
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
	assert.match(body, /function ending in `Reading` returns the command's exact exit/u);
	assert.match(body, /function ending in `Document` runs that byte reading once in JSON mode/u);
	assert.match(body, /four raw operations have byte readings only/u);
});
