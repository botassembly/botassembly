import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test, { afterEach } from 'node:test';
import { fileURLToPath } from 'node:url';

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const checker = join(repository, 'scripts', 'check-size-decision.mjs');
const roots = [];

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function git(root, ...args) {
	const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
	assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

async function put(root, path, content) {
	const target = join(root, path);
	await mkdir(dirname(target), { recursive: true });
	await writeFile(target, content);
}

async function fixture({ config = true, ticket = false } = {}) {
	const root = await mkdtemp(join(tmpdir(), 'bot-size-decision-'));
	roots.push(root);
	git(root, 'init', '-q');
	git(root, 'config', 'user.email', 'test@example.com');
	git(root, 'config', 'user.name', 'Test');
	if (config) await ceiling(root, 10);
	if (ticket) await put(root, 'sdlc/planning/bot-contraction/tickets/0030-size-decision.md', decision(10, 11));
	await put(root, 'README.md', 'fixture\n');
	git(root, 'add', '.');
	git(root, 'commit', '-qm', 'baseline');
	return root;
}

async function ceiling(root, max) {
	await put(root, 'sdlc/ratchet.json', `${JSON.stringify({ directory: 'bot/src', extension: '.ts', max }, null, 2)}\n`);
}

function decision(start, end, overrides = {}) {
	const fields = {
		'Starting production size': `${start} nonblank lines`,
		'Ending production size': `${end} nonblank lines`,
		'Simpler approach tried': 'delete an older helper',
		'Why insufficient alternatives were rejected': 'the retained behavior still needs one branch',
		'Production code deleted': 'two obsolete lines',
		'Accepted cost': 'one narrow production branch',
		...overrides,
	};
	return `# Work\n\n## Size decision\n\n${Object.entries(fields).map(([name, value]) => `- ${name}: ${value}`).join('\n')}\n`;
}

function check(root) {
	const stdout = join(root, '.size-decision.stdout');
	const stderr = join(root, '.size-decision.stderr');
	return spawnSync('sh', ['-c', '"$1" "$2" "$3" >"$4" 2>"$5"; status=$?; cat "$4"; cat "$5" >&2; exit "$status"',
		'check-size-decision', process.execPath, checker, root, stdout, stderr], {
		encoding: 'utf8',
		env: { HOME: root, LANG: 'C.UTF-8', PATH: process.env.PATH ?? '' },
	});
}

test('unchanged and lowered working ceilings need no decision', async () => {
	const root = await fixture();
	assert.equal(check(root).status, 0);
	await ceiling(root, 9);
	assert.equal(check(root).status, 0);
});

test('a working increase needs one complete matching decision', async () => {
	const root = await fixture();
	await ceiling(root, 11);
	let result = check(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /applicable size decision/u);
	assert.ok(Buffer.byteLength(result.stderr) <= 2_048);

	await put(root, 'sdlc/planning/bot-contraction/tickets/0030-size-decision.md', decision(10, 12, {
		'Simpler approach tried': '',
	}));
	result = check(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /Simpler approach tried/u);
	assert.match(result.stderr, /Ending production size/u);

	await put(root, 'sdlc/planning/bot-contraction/tickets/0030-size-decision.md', decision(10, 11));
	assert.equal(check(root).status, 0);
});

test('an untracked current ticket can justify a working increase', async () => {
	const root = await fixture();
	await ceiling(root, 11);
	await put(root, 'sdlc/tickets/drafts/0030-size-decision.md', decision(10, 11));
	assert.equal(check(root).status, 0);
});

test('a changed direct active ticket alone can justify a working increase', async () => {
	const root = await fixture();
	await put(root, 'sdlc/tickets/0030-size-decision.md', decision(10, 11));
	git(root, 'add', '.');
	git(root, 'commit', '-qm', 'add an unchanged active decision');
	await ceiling(root, 11);
	await put(root, 'sdlc/tickets/README.md', decision(10, 11));
	assert.equal(check(root).status, 1);

	await put(root, 'sdlc/tickets/0030-size-decision.md', `${decision(10, 11)}\nCurrent work.\n`);
	assert.equal(check(root).status, 0);
});

test('a current completion record justifies its committed increase', async () => {
	const root = await fixture();
	await ceiling(root, 11);
	await put(root, 'sdlc/records/0030-size-decision.md', decision(10, 11));
	git(root, 'add', '.');
	git(root, 'commit', '-qm', 'complete current work');
	assert.equal(check(root).status, 0);
});

test('only a ticket changed with the working ceiling can justify it', async () => {
	const root = await fixture({ ticket: true });
	await ceiling(root, 11);
	assert.equal(check(root).status, 1);
	await put(root, 'sdlc/planning/bot-contraction/tickets/0030-size-decision.md', `${decision(10, 11)}\nCurrent work.\n`);
	assert.equal(check(root).status, 0);
});

test('multiple working decisions refuse the increase', async () => {
	const root = await fixture();
	await ceiling(root, 11);
	await put(root, 'sdlc/planning/bot-contraction/tickets/0030-size-decision.md', decision(10, 11));
	await put(root, 'sdlc/planning/bot-contraction/tickets/0031-second-decision.md', decision(10, 11));
	const result = check(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /exactly one/u);
	assert.ok(Buffer.byteLength(result.stderr) <= 2_048);
});

test('a ticket-folder README cannot authorize a working increase', async () => {
	const root = await fixture();
	await ceiling(root, 11);
	await put(root, 'sdlc/planning/bot-contraction/tickets/README.md', decision(10, 11));
	const result = check(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /exactly one applicable size decision/u);
});

test('a newly completed record justifies its commit but no later commit needs it', async () => {
	const root = await fixture({ ticket: true });
	await ceiling(root, 11);
	const ticket = join(root, 'sdlc/planning/bot-contraction/tickets/0030-size-decision.md');
	const record = join(root, 'sdlc/planning/bot-contraction/records/0030-size-decision.md');
	await mkdir(dirname(record), { recursive: true });
	await rename(ticket, record);
	git(root, 'add', '.');
	git(root, 'commit', '-qm', 'complete work');
	assert.equal(check(root).status, 0);

	await put(root, 'later.txt', 'unrelated\n');
	git(root, 'add', '.');
	git(root, 'commit', '-qm', 'later change');
	assert.equal(check(root).status, 0);
});

test('a committed increase is judged from the committed decision', async () => {
	const root = await fixture();
	await ceiling(root, 11);
	await put(root, 'sdlc/planning/bot-contraction/records/0030-size-decision.md', decision(10, 12));
	git(root, 'add', '.');
	git(root, 'commit', '-qm', 'mismatched increase');
	assert.equal(check(root).status, 1);

	await put(root, 'sdlc/planning/bot-contraction/records/0030-size-decision.md', decision(10, 11));
	const result = check(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /Ending production size/u);
});

test('an unrelated record-folder Markdown file cannot authorize a committed increase', async () => {
	const root = await fixture();
	await ceiling(root, 11);
	await put(root, 'sdlc/planning/bot-contraction/records/size-decision.md', decision(10, 11));
	git(root, 'add', '.');
	git(root, 'commit', '-qm', 'unrelated markdown');
	const result = check(root);
	assert.equal(result.status, 1);
	assert.match(result.stderr, /exactly one applicable size decision/u);
});

test('an initial commit establishes its baseline', async () => {
	const root = await fixture();
	git(root, 'checkout', '--orphan', 'initial-check');
	git(root, 'rm', '-qrf', '.');
	await ceiling(root, 50);
	git(root, 'add', '.');
	git(root, 'commit', '-qm', 'initial');
	assert.equal(check(root).status, 0);
});

test('missing Git history and an unreadable comparison fail boundedly', async () => {
	const nonGit = await mkdtemp(join(tmpdir(), 'bot-size-decision-nongit-'));
	roots.push(nonGit);
	await ceiling(nonGit, 11);
	for (const root of [nonGit, await fixture({ config: false })]) {
		if (root !== nonGit) await ceiling(root, 11);
		const result = check(root);
		assert.equal(result.status, 1);
		assert.ok(Buffer.byteLength(result.stderr) > 0);
		assert.ok(Buffer.byteLength(result.stderr) <= 2_048);
	}
});
