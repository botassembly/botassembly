import assert from 'node:assert/strict';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test, { afterEach } from 'node:test';
import { fileURLToPath } from 'node:url';
import { findCaseCollisions } from './check-case-collisions.mjs';

const scripts = dirname(fileURLToPath(import.meta.url));
const repository = dirname(scripts);
const checker = join(scripts, 'check-case-collisions.mjs');
const roots = [];

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function git(root, ...args) {
	const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
	assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

async function fixture(paths) {
	const root = await mkdtemp(join(tmpdir(), 'bot-case-collision-'));
	roots.push(root);
	git(root, 'init', '-q');
	git(root, 'config', 'user.email', 'test@example.com');
	git(root, 'config', 'user.name', 'Test');
	for (const path of paths) {
		const target = join(root, path);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, 'fixture\n');
	}
	git(root, 'add', '--all');
	git(root, 'commit', '-qm', 'baseline');
	return root;
}

async function indexFixture(paths) {
	const root = await mkdtemp(join(tmpdir(), 'bot-case-collision-index-'));
	roots.push(root);
	git(root, 'init', '-q');
	const blob = spawnSync('git', ['hash-object', '-w', '--stdin'], {
		cwd: root,
		encoding: 'utf8',
		input: Buffer.from('fixture\n'),
	});
	assert.equal(blob.status, 0, `${blob.stdout}\n${blob.stderr}`);
	const entries = Buffer.concat(paths.map((path) => Buffer.from(
		`100644 ${blob.stdout.trim()}\t${path}\0`,
	)));
	const update = spawnSync('git', ['update-index', '--add', '-z', '--index-info'], {
		cwd: root,
		encoding: 'utf8',
		input: entries,
	});
	assert.equal(update.status, 0, `${update.stdout}\n${update.stderr}`);
	return root;
}

function check(root, env = process.env) {
	return spawnSync(process.execPath, [checker, root], { encoding: 'utf8', env });
}

test('clean tracked paths pass', async () => {
	const root = await fixture(['README.md', 'src/main.ts']);
	const result = check(root);
	assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
	assert.equal(result.stdout, '');
	assert.equal(result.stderr, '');
});

test('basename case collision fails with both names', async () => {
	const root = await indexFixture(['README.md', 'readme.md']);
	const result = check(root);
	assert.equal(result.status, 1);
	assert.equal(result.stderr, 'case-collision: "README.md" and "readme.md"\n');
});

test('directory-segment case collision compares the whole relative path', () => {
	assert.deepEqual(findCaseCollisions(['src/Main.ts', 'Src/main.ts']), [['Src/main.ts', 'src/Main.ts']]);
});

test('repeated identical input is not a collision', () => {
	assert.deepEqual(findCaseCollisions(['README.md', 'README.md']), []);
});

test('spaces and newlines remain one escaped diagnostic name', () => {
	assert.deepEqual(findCaseCollisions(['dir/a file\nname', 'DIR/A FILE\nNAME']), [
		['DIR/A FILE\nNAME', 'dir/a file\nname'],
	]);
});

test('Git paths containing a newline produce one escaped diagnostic', async () => {
	const root = await indexFixture(['dir/a file\nname', 'DIR/A FILE\nNAME']);
	const result = check(root);
	assert.equal(result.status, 1);
	assert.equal(result.stderr, 'case-collision: "DIR/A FILE\\nNAME" and "dir/a file\\nname"\n');
});

test('Unicode case pairs collide without normalization', async () => {
	const root = await indexFixture(['café.txt', 'CAFÉ.TXT']);
	const result = check(root);
	assert.equal(result.status, 1);
	assert.equal(result.stderr, 'case-collision: "CAFÉ.TXT" and "café.txt"\n');
});

test('collision names are deterministic regardless of input order', () => {
	const paths = ['z/alpha', 'Z/ALPHA', 'a/b', 'A/B'];
	assert.deepEqual(findCaseCollisions(paths), findCaseCollisions([...paths].reverse()));
	assert.deepEqual(findCaseCollisions(paths), [['A/B', 'a/b'], ['Z/ALPHA', 'z/alpha']]);
});

test('a Git command failure remains nonzero and named', async () => {
	const root = await mkdtemp(join(tmpdir(), 'bot-case-collision-nongit-'));
	roots.push(root);
	const result = check(root);
	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /case-collision: git ls-files (failed|exited)/u);
});

test('invalid UTF-8 from Git fails clearly', async () => {
	const root = await mkdtemp(join(tmpdir(), 'bot-case-collision-invalid-utf8-'));
	const bin = await mkdtemp(join(tmpdir(), 'bot-case-collision-git-'));
	roots.push(root, bin);
	const fakeGit = join(bin, 'git');
	await writeFile(fakeGit, "#!/bin/sh\nprintf '\\377\\0'\n");
	await chmod(fakeGit, 0o755);
	const result = check(root, { ...process.env, PATH: `${bin}:${process.env.PATH}` });
	assert.equal(result.status, 1);
	assert.equal(result.stderr, 'case-collision: git ls-files returned invalid UTF-8 path bytes\n');
});

test('lint invokes the documentation generator and project-owned checker', async () => {
	const bin = await mkdtemp(join(tmpdir(), 'bot-case-collision-bin-'));
	roots.push(bin);
	const log = join(bin, 'calls');
	const fakeNode = join(bin, 'node');
	const fakeMake = join(bin, 'make');
	await writeFile(fakeNode, '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$CASE_COLLISION_LOG"\n');
	await writeFile(fakeMake, '#!/bin/sh\nexit 0\n');
	await chmod(fakeNode, 0o755);
	await chmod(fakeMake, 0o755);
	const environment = { ...process.env, PATH: `${bin}:${process.env.PATH}`, CASE_COLLISION_LOG: log };
	delete environment.SDLC_IN_CHECK;
	const result = spawnSync('sh', [join(repository, 'sdlc', 'scripts', 'lint')], {
		cwd: repository,
		encoding: 'utf8',
		env: environment,
	});
	assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
	const calls = await readFile(log, 'utf8');
	assert.match(calls, /docs\/scripts\/generate-specification\.mjs/u);
	assert.match(calls, /scripts\/check-case-collisions\.mjs/u);
});
