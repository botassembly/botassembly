import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(repository, 'sdlc', 'scripts', 'install-gitleaks');

async function executable(path, body) { await writeFile(path, `#!/bin/sh\n${body}\n`); await chmod(path, 0o755); }

async function fixture(system, machine, options = {}) {
	const root = await mkdtemp(join(tmpdir(), 'bot assembly install gitleaks '));
	const scripts = join(root, 'sdlc', 'scripts'); const bin = join(root, 'bin');
	await mkdir(scripts, { recursive: true }); await mkdir(bin);
	await writeFile(join(scripts, 'install-gitleaks'), await readFile(source)); await chmod(join(scripts, 'install-gitleaks'), 0o755);
	await executable(join(bin, 'uname'), `[ "$1" = -s ] && echo '${system}' || echo '${machine}'`);
	await executable(join(bin, 'curl'), options.downloadFailure ? 'exit 1' : `printf 'curl %s\\n' "$*" >>'${join(root, 'calls')}'\nout=; while [ "$#" -gt 0 ]; do [ "$1" = --output ] && { shift; out=$1; }; shift; done; : >"$out"`);
	const version = options.version ?? '8.30.1';
	await executable(join(bin, 'tar'), options.badArchive ? 'exit 1' : `while [ "$#" -gt 0 ]; do [ "$1" = -C ] && { shift; dest=$1; }; shift; done\nprintf '#!/bin/sh\\necho ${version}\\n' >"$dest/gitleaks"`);
	await executable(join(bin, 'sha256sum'), `input=$(cat); printf 'sha256sum %s %s\\n' "$*" "$input" >>'${join(root, 'calls')}'\n${options.badHash ? 'exit 1' : ':'}`);
	await executable(join(bin, 'shasum'), `input=$(cat); printf 'shasum %s %s\\n' "$*" "$input" >>'${join(root, 'calls')}'\n${options.badHash ? 'exit 1' : ':'}`);
	await symlink('/usr/bin/mktemp', join(bin, 'mktemp'));
	return { root, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } };
}

function run(root, env) { return spawnSync('/bin/sh', ['sdlc/scripts/install-gitleaks'], { cwd: root, env, encoding: 'utf8' }); }

test('each supported platform selects the official asset and hash command', async () => {
	for (const [system, machine, asset, hash, digest] of [
		['Linux', 'x86_64', 'linux_x64', 'sha256sum', '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb'],
		['Linux', 'amd64', 'linux_x64', 'sha256sum', '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb'],
		['Linux', 'aarch64', 'linux_arm64', 'sha256sum', 'e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080'],
		['Linux', 'arm64', 'linux_arm64', 'sha256sum', 'e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080'],
		['Darwin', 'x86_64', 'darwin_x64', 'shasum', 'dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709'],
		['Darwin', 'amd64', 'darwin_x64', 'shasum', 'dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709'],
		['Darwin', 'arm64', 'darwin_arm64', 'shasum', 'b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5'],
		['Darwin', 'aarch64', 'darwin_arm64', 'shasum', 'b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5'],
	]) {
		const { root, env } = await fixture(system, machine);
		try {
			const result = run(root, env); assert.equal(result.status, 0, result.stderr);
			const calls = await readFile(join(root, 'calls'), 'utf8');
			assert.match(calls, new RegExp(`${hash} .*${digest}`));
			assert.match(calls, new RegExp(`curl .*gitleaks_8\\.30\\.1_${asset}\\.tar\\.gz`));
			assert.match(result.stdout, /Gitleaks 8\.30\.1/);
			assert.equal(spawnSync(join(root, '.tools/gitleaks/8.30.1/gitleaks'), [], { encoding: 'utf8' }).stdout.trim(), '8.30.1');
			assert.match(await readFile(join(root, 'bin', 'curl'), 'utf8'), /--output/);
		} finally { await rm(root, { recursive: true, force: true }); }
	}
});

test('unsupported systems, checksum mismatches, and wrong archive versions fail plainly', async () => {
	for (const [system, machine, options, pattern] of [
		['FreeBSD', 'x86_64', {}, /does not support/],
		['Linux', 'x86_64', { downloadFailure: true }, /could not download/],
		['Linux', 'x86_64', { badHash: true }, /checksum did not match/],
		['Linux', 'x86_64', { badArchive: true }, /archive was malformed/],
		['Linux', 'x86_64', { version: '8.30.0' }, /did not report version 8\.30\.1/],
	]) {
		const { root, env } = await fixture(system, machine, options);
		try { const result = run(root, env); assert.notEqual(result.status, 0); assert.match(result.stderr, pattern); }
		finally { await rm(root, { recursive: true, force: true }); }
	}
});

test('a missing required hash tool fails before download', async () => {
	const { root } = await fixture('Linux', 'x86_64');
	const bin = join(root, 'bin');
	for (const name of ['dirname', 'cat']) await symlink(`/usr/bin/${name}`, join(bin, name));
	await rm(join(bin, 'sha256sum'));
	try {
		const result = run(root, { PATH: bin });
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /sha256sum is required/);
	} finally { await rm(root, { recursive: true, force: true }); }
});

test('each missing preparation tool fails before download', async () => {
	for (const missing of ['curl', 'tar', 'mktemp']) {
		const { root } = await fixture('Linux', 'x86_64');
		const bin = join(root, 'bin');
		await symlink('/usr/bin/dirname', join(bin, 'dirname'));
		await rm(join(bin, missing));
		try {
			const result = run(root, { PATH: bin });
			assert.notEqual(result.status, 0);
			assert.match(result.stderr, new RegExp(`${missing} is required`));
		} finally { await rm(root, { recursive: true, force: true }); }
	}
});

test('a verified install safely replaces a partial target', async () => {
	const { root, env } = await fixture('Linux', 'x86_64');
	try {
		const target = join(root, '.tools/gitleaks/8.30.1'); await mkdir(target, { recursive: true }); await writeFile(join(target, 'partial'), 'old\n');
		const result = run(root, env); assert.equal(result.status, 0, result.stderr);
		assert.equal(spawnSync(join(target, 'gitleaks'), [], { encoding: 'utf8' }).stdout.trim(), '8.30.1');
		assert.notEqual(spawnSync(join(target, 'partial')).status, 0);
	} finally { await rm(root, { recursive: true, force: true }); }
});
