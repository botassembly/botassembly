import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const docs = dirname(dirname(fileURLToPath(import.meta.url)));
const modelsReference = join(docs, 'src', 'content', 'docs', 'operate', 'providers-and-credentials.md');

async function procedure() {
	const source = await readFile(modelsReference, 'utf8');
	const match = /For a linked default model file[^\n]*:\n\n```sh\n([\s\S]*?)\n```/u.exec(source);
	assert.ok(match, 'the providers page has no migration procedure');
	return match[1];
}

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'bot-model-migration-'));
	const agent = join(root, 'agent');
	await mkdir(agent, { mode: 0o700 });
	return { root, agent, models: join(agent, 'models.json'), copy: join(agent, 'models.private-copy') };
}

function run(script, agent) {
	return spawnSync('sh', ['-c', script], {
		encoding: 'utf8',
		env: { PATH: process.env.PATH, PI_CODING_AGENT_DIR: agent },
	});
}

test('the published model migration replaces one link with a private regular copy', async () => {
	const held = await fixture();
	try {
		const target = join(held.root, 'target.json');
		await writeFile(target, 'model configuration\n', { mode: 0o644 });
		await symlink(target, held.models);
		const result = run(await procedure(), held.agent);
		assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
		const facts = await lstat(held.models);
		assert.equal(facts.isFile(), true);
		assert.equal(facts.isSymbolicLink(), false);
		assert.equal(facts.mode & 0o777, 0o600);
		assert.equal(await readFile(held.models, 'utf8'), 'model configuration\n');
		await assert.rejects(lstat(held.copy));
	} finally {
		await rm(held.root, { recursive: true, force: true });
	}
});

test('the published model migration leaves a regular model file unchanged', async () => {
	const held = await fixture();
	try {
		await writeFile(held.models, 'regular input\n', { mode: 0o600 });
		const before = await lstat(held.models);
		const result = run(await procedure(), held.agent);
		assert.notEqual(result.status, 0);
		const after = await lstat(held.models);
		assert.equal(after.ino, before.ino);
		assert.equal(await readFile(held.models, 'utf8'), 'regular input\n');
		await assert.rejects(lstat(held.copy));
	} finally {
		await rm(held.root, { recursive: true, force: true });
	}
});

test('the published model migration refuses an existing regular copy without changing either file', async () => {
	const held = await fixture();
	try {
		const target = join(held.root, 'target.json');
		await writeFile(target, 'linked input\n', { mode: 0o600 });
		await symlink(target, held.models);
		await writeFile(held.copy, 'existing copy\n', { mode: 0o600 });
		const result = run(await procedure(), held.agent);
		assert.notEqual(result.status, 0);
		assert.equal(await readlink(held.models), target);
		assert.equal(await readFile(target, 'utf8'), 'linked input\n');
		assert.equal(await readFile(held.copy, 'utf8'), 'existing copy\n');
	} finally {
		await rm(held.root, { recursive: true, force: true });
	}
});

test('the published model migration refuses an existing copy symlink without following it', async () => {
	const held = await fixture();
	try {
		const target = join(held.root, 'target.json');
		const sentinel = join(held.root, 'sentinel.txt');
		await writeFile(target, 'linked input\n', { mode: 0o600 });
		await symlink(target, held.models);
		await symlink(sentinel, held.copy);
		const result = run(await procedure(), held.agent);
		assert.notEqual(result.status, 0);
		assert.equal(await readlink(held.models), target);
		assert.equal(await readlink(held.copy), sentinel);
		assert.equal(await readFile(target, 'utf8'), 'linked input\n');
		await assert.rejects(lstat(sentinel));
	} finally {
		await rm(held.root, { recursive: true, force: true });
	}
});
