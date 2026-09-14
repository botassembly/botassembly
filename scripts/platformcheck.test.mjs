import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(repository, 'sdlc', 'scripts', 'platformcheck');
const files = [
	'tests/cli-assembly-install-atomic.test.ts', 'tests/cli-assembly-install-process.test.ts',
	'tests/install-refuses-a-non-assembly.test.ts', 'tests/owned-removal.test.ts',
	'tests/flow-cleanup.test.ts', 'tests/process.test.ts', 'tests/cli-signal-boundary.test.ts',
	'tests/subflow-local-signal.test.ts', 'tests/cli-worktree-lock.test.ts',
	'tests/run-birth-reservation.test.ts', 'tests/request-limit.test.ts', 'tests/process-stdin.test.ts',
	'tests/cli-exit.test.ts', 'tests/ordinary-cli-output.test.ts', 'tests/ordinary-output.test.ts',
	'tests/raw-record-races.test.ts',
];
const expected = ['make installcheck', 'sh sdlc/scripts/examples'];
for (const file of files) expected.push(`npm run test -- ${file}`);
for (let repeat = 0; repeat < 10; repeat += 1) {
	expected.push('npm run test -- tests/install-refuses-a-non-assembly.test.ts');
	expected.push('npm run test -- tests/subflow-local-signal.test.ts');
}

async function fixture(system, failAt = '') {
	const root = await mkdtemp(join(tmpdir(), 'bot-platformcheck-'));
	await mkdir(join(root, 'sdlc', 'scripts'), { recursive: true });
	await mkdir(join(root, 'bot'));
	await mkdir(join(root, 'bin'));
	await writeFile(join(root, 'sdlc', 'scripts', 'platformcheck'), await readFile(source));
	const command = async (name, body) => {
		const path = join(root, 'bin', name);
		await writeFile(path, `#!/bin/sh\n${body}\n`);
		await chmod(path, 0o755);
	};
	await command('uname', `printf '%s\\n' '${system}'`);
	for (const name of ['make', 'sh', 'npm']) {
		await command(name, [
			`count=0; [ ! -f '${join(root, 'count')}' ] || count=$(cat '${join(root, 'count')}')`,
			'count=$((count + 1))',
			`printf '%s\\n' "$count" > '${join(root, 'count')}'`,
			`line='${name} '"$*"`,
			`printf '%s\\n' "$line" >> '${join(root, 'calls')}'`,
			`[ "$line#$count" != '${failAt}' ]`,
		].join('\n'));
	}
	return { root, result: () => spawnSync('/bin/sh', [join(root, 'sdlc', 'scripts', 'platformcheck')], {
		env: { ...process.env, PATH: `${join(root, 'bin')}:/usr/bin:/bin` }, encoding: 'utf8',
	}) };
}

test('Linux and Darwin select the same ordered owners and repetitions', async () => {
	const observed = [];
	for (const system of ['Linux', 'Darwin']) {
		const held = await fixture(system);
		try {
			assert.equal(held.result().status, 0);
			observed.push(await readFile(join(held.root, 'calls'), 'utf8'));
		} finally { await rm(held.root, { recursive: true, force: true }); }
	}
	assert.equal(observed[0], observed[1]);
	assert.deepEqual(observed[0].trimEnd().split('\n'), expected);
});

test('an unsupported uname refuses before an owner runs', async () => {
	const held = await fixture('Windows_NT');
	try {
		const result = held.result();
		assert.equal(result.status, 2);
		assert.equal(result.stderr, 'platformcheck: unsupported system: Windows_NT\n');
		await assert.rejects(readFile(join(held.root, 'calls')));
	} finally { await rm(held.root, { recursive: true, force: true }); }
});

for (const [name, failAt, count] of [
	['install', 'make installcheck#1', 1],
	['examples', 'sh sdlc/scripts/examples#2', 2],
	['named platform test process', 'npm run test -- tests/process.test.ts#8', 8],
	['a repeated test process', 'npm run test -- tests/subflow-local-signal.test.ts#20', 20],
]) {
	test(`a failed ${name} owner stops at its exact invocation`, async () => {
		const held = await fixture('Linux', String(failAt));
		try {
			assert.notEqual(held.result().status, 0);
			assert.deepEqual((await readFile(join(held.root, 'calls'), 'utf8')).trimEnd().split('\n'), expected.slice(0, Number(count)));
		} finally { await rm(held.root, { recursive: true, force: true }); }
	});
}
