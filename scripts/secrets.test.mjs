import assert from 'node:assert/strict';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const scanner = join(repository, '.tools', 'gitleaks', '8.30.1', 'gitleaks');
const token = () => ['glpat', 'abcdefghijklmnopqrst'].join('-');

function run(root, env = process.env) {
	return spawnSync('sh', ['sdlc/scripts/secrets'], { cwd: root, env, encoding: 'utf8' });
}

function git(root, ...args) {
	const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
	assert.equal(result.status, 0, result.stderr);
}

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'bot assembly secrets '));
	await mkdir(join(root, 'sdlc', 'scripts'), { recursive: true });
	await mkdir(join(root, '.tools', 'gitleaks', '8.30.1'), { recursive: true });
	await cp(join(repository, 'sdlc', 'scripts', 'secrets'), join(root, 'sdlc', 'scripts', 'secrets'));
	await cp(join(repository, '.gitleaks.toml'), join(root, '.gitleaks.toml'));
	await cp(scanner, join(root, '.tools', 'gitleaks', '8.30.1', 'gitleaks'));
	await chmod(join(root, 'sdlc', 'scripts', 'secrets'), 0o755);
	await chmod(join(root, '.tools', 'gitleaks', '8.30.1', 'gitleaks'), 0o755);
	git(root, 'init', '-q');
	git(root, 'config', 'user.email', 'test@example.com');
	git(root, 'config', 'user.name', 'Test');
	await writeFile(join(root, 'clean.txt'), 'ordinary fixture\n');
	git(root, 'add', '.gitleaks.toml', 'sdlc/scripts/secrets', 'clean.txt');
	git(root, 'commit', '-qm', 'root');
	return root;
}

function assertSecretFailure(result, value) {
	assert.notEqual(result.status, 0);
	assert.equal(`${result.stdout}${result.stderr}`.includes(value), false);
}

test('the real pinned scanner accepts a clean repository', async () => {
	const root = await fixture();
	try {
		const result = run(root);
		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stdout, '');
		assert.equal(result.stderr, '');
	} finally { await rm(root, { recursive: true, force: true }); }
});

test('ignored, untracked, and modified working files cannot hide a runtime-created credential', async () => {
	for (const kind of ['ignored', 'untracked', 'modified']) {
		const root = await fixture();
		try {
			const value = token();
			if (kind === 'ignored') {
				await writeFile(join(root, '.gitignore'), '.env\n');
				git(root, 'add', '.gitignore'); git(root, 'commit', '-qm', 'ignore environment');
				await writeFile(join(root, '.env'), `TOKEN=${value}\n`);
			} else if (kind === 'untracked') {
				await writeFile(join(root, 'loose.txt'), `${value}\n`);
			} else {
				await writeFile(join(root, 'clean.txt'), `${value}\n`);
			}
			assertSecretFailure(run(root), value);
		} finally { await rm(root, { recursive: true, force: true }); }
	}
});

test('deleted, branch-only, tag-only, and merge-introduced history remain covered', async () => {
	for (const kind of ['deleted', 'branch', 'tag', 'merge']) {
		const root = await fixture();
		try {
			const value = token();
			if (kind === 'deleted') {
				await writeFile(join(root, 'past.txt'), `${value}\n`); git(root, 'add', 'past.txt'); git(root, 'commit', '-qm', 'add');
				await rm(join(root, 'past.txt')); git(root, 'commit', '-qam', 'delete');
			} else if (kind === 'branch' || kind === 'tag') {
				git(root, 'switch', '-qc', 'hidden');
				await writeFile(join(root, 'past.txt'), `${value}\n`); git(root, 'add', 'past.txt'); git(root, 'commit', '-qm', 'hidden');
				if (kind === 'tag') { git(root, 'tag', 'only-tag'); git(root, 'switch', '-q', '-'); git(root, 'branch', '-D', 'hidden'); }
				else git(root, 'switch', '-q', '-');
			} else {
				git(root, 'switch', '-qc', 'side'); await writeFile(join(root, 'side.txt'), 'side\n'); git(root, 'add', 'side.txt'); git(root, 'commit', '-qm', 'side');
				git(root, 'switch', '-q', '-'); await writeFile(join(root, 'main.txt'), 'main\n'); git(root, 'add', 'main.txt'); git(root, 'commit', '-qm', 'main');
				git(root, 'merge', '--no-commit', '--no-ff', 'side'); await writeFile(join(root, 'merge-only.txt'), `${value}\n`); git(root, 'add', 'merge-only.txt'); git(root, 'commit', '-qm', 'merge');
				await rm(join(root, 'merge-only.txt')); git(root, 'commit', '-qam', 'delete merge value');
			}
			assertSecretFailure(run(root), value);
		} finally { await rm(root, { recursive: true, force: true }); }
	}
});

test('inline, ignore-file, ambient-config, and shallow bypasses fail', async () => {
	let root = await fixture();
	try {
		const value = token();
		await writeFile(join(root, 'inline.txt'), `${value} # gitleaks:allow\n`);
		assertSecretFailure(run(root), value);
	} finally { await rm(root, { recursive: true, force: true }); }

	root = await fixture();
	try {
		await writeFile(join(root, '.gitleaksignore'), 'anything\n');
		const result = run(root);
		assert.notEqual(result.status, 0); assert.match(result.stderr, /\.gitleaksignore is not permitted/);
	} finally { await rm(root, { recursive: true, force: true }); }

	root = await fixture();
	try {
		const value = token();
		await writeFile(join(root, 'loose.txt'), `${value}\n`);
		const ambient = join(root, 'ambient.toml');
		await writeFile(ambient, '[allowlist]\nregexTarget = "match"\nregexes = [".*"]\n');
		assertSecretFailure(run(root, { ...process.env, GITLEAKS_CONFIG: ambient }), value);
	} finally { await rm(root, { recursive: true, force: true }); }

	root = await fixture();
	try {
		const shallow = `${root}-shallow`;
		git(dirname(root), 'clone', '-q', '--depth=1', `file://${root}`, shallow);
		await mkdir(join(shallow, '.tools', 'gitleaks', '8.30.1'), { recursive: true });
		await cp(scanner, join(shallow, '.tools', 'gitleaks', '8.30.1', 'gitleaks'));
		await chmod(join(shallow, '.tools', 'gitleaks', '8.30.1', 'gitleaks'), 0o755);
		try { const result = run(shallow); assert.notEqual(result.status, 0); assert.match(result.stderr, /full Git history is required/); }
		finally { await rm(shallow, { recursive: true, force: true }); }
	} finally { await rm(root, { recursive: true, force: true }); }
});

test('every generated root is excluded while similarly named source paths remain covered', async () => {
	const root = await fixture();
	try {
		const value = token();
		const generated = [
			'.git/generated.txt', '.tools/generated.txt', 'bot/node_modules/generated.txt',
			'docs/node_modules/generated.txt', 'bot/coverage/generated.txt', 'docs/dist/generated.txt',
			'docs/.astro/generated.txt', 'bot/.bot-test-one/generated.txt',
		];
		for (const relative of generated) {
			await mkdir(dirname(join(root, relative)), { recursive: true });
			await writeFile(join(root, relative), `${value}\n`);
		}
		assert.equal(run(root).status, 0);
		const lookalikes = [
			'.git-looking/source.txt', '.tools-looking/source.txt', 'nested/.tools/source.txt',
			'bot/node_modules-looking/source.txt', 'docs/node_modules-looking/source.txt',
			'bot/coverage-looking/source.txt', 'docs/dist-looking/source.txt',
			'docs/.astro-looking/source.txt', 'bot/.bot-testing-one/source.txt',
		];
		for (const relative of lookalikes) {
			await mkdir(dirname(join(root, relative)), { recursive: true });
			await writeFile(join(root, relative), `${value}\n`);
			assertSecretFailure(run(root), value);
			await rm(join(root, relative));
		}
	} finally { await rm(root, { recursive: true, force: true }); }
});

test('scanner warnings and errors fail even when Gitleaks exits zero', async () => {
	for (const kind of ['file', 'directory']) {
		const root = await fixture();
		try {
			const path = join(root, kind === 'file' ? 'unreadable.txt' : 'unreadable');
			if (kind === 'file') await writeFile(path, 'unreadable\n');
			else { await mkdir(path); await writeFile(join(path, 'inside.txt'), 'unreadable\n'); }
			await chmod(path, 0o000);
			const result = run(root);
			await chmod(path, 0o700);
			assert.notEqual(result.status, 0);
			assert.match(result.stderr, /reported a warning or error/);
		} finally { await rm(root, { recursive: true, force: true }); }
	}
});

test('missing and wrong scanner versions name the one preparation command', async () => {
	const root = await fixture();
	try {
		const binary = join(root, '.tools', 'gitleaks', '8.30.1', 'gitleaks');
		await rm(binary);
		let result = run(root); assert.notEqual(result.status, 0); assert.match(result.stderr, /sh sdlc\/scripts\/install/);
		await writeFile(binary, '#!/bin/sh\necho 0.0.0\n'); await chmod(binary, 0o755);
		result = run(root); assert.notEqual(result.status, 0); assert.match(result.stderr, /sh sdlc\/scripts\/install/);
	} finally { await rm(root, { recursive: true, force: true }); }
});
