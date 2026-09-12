import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkPublicTree, publicTreeViolations } from './check-public-tree.mjs';

const repository = new URL('..', import.meta.url).pathname;
const hostile = ['genom', 'oncology'].join('');

function temporaryRepository() {
	const directory = mkdtempSync(join(tmpdir(), 'public-tree-'));
	execFileSync('git', ['init', '--quiet', '--initial-branch=main'], { cwd: directory });
	return directory;
}

test('the current tracked tree passes the public-tree boundary', () => {
	assert.deepEqual(checkPublicTree(repository), []);
});

test('path checks reject dogfood and credential basenames', () => {
	const paths = [
		'sdlc/planning/dogfood/run/request.txt',
		'SDLC/PLANNING/DOGFOOD/run/request.txt',
		'config/.env',
		'x/.env.local',
		'config/.ENV.PRODUCTION',
		'auth.json',
		'nested/credentials.json',
		'nested/AUTH.JSON',
	];
	const violations = publicTreeViolations(paths);
	assert.equal(violations.length, paths.length);
});

test('pathname checks inspect broken symlinks', () => {
	const temporary = temporaryRepository();
	try {
		symlinkSync('missing-target', join(temporary, 'credentials.json'));
		execFileSync('git', ['add', 'credentials.json'], { cwd: temporary });
		assert.deepEqual(checkPublicTree(temporary), ['forbidden credential basename "credentials.json"']);
	} finally {
		rmSync(temporary, { recursive: true, force: true });
	}
});

test('every maintained prose class rejects a hostile private token', () => {
	const paths = [
		'README.md',
		'SECURITY.md',
		'CONTRIBUTING.md',
		'docs/src/content/docs/index.mdx',
		'docs/src/content/docs/guides/example.md',
		'specification/README.md',
		'specification/CHANGELOG.md',
		'specification/conformance.md',
		'specification/example.md',
		'specification/elements/example.md',
		'smoke/README.md',
		'smoke/falsifications.md',
		'sdlc/planning/plan.md',
		'sdlc/tickets/drafts/9999-example.md',
		'sdlc/issues/example.md',
		'sdlc/README.md',
		'sdlc/scripts/README.md',
	];
	assert.deepEqual(
		publicTreeViolations(paths, () => hostile),
		paths.map((path) => `forbidden public prose "${path}"`),
	);
});

test('raw example runs cannot enter the public tree', () => {
	assert.deepEqual(
		publicTreeViolations(['examples/runs/triage/run/session.jsonl']),
		['tracked raw example run "examples/runs/triage/run/session.jsonl"'],
	);
});

test('retained run paths and record or session basenames cannot hide elsewhere', () => {
	const paths = [
		'public/runs/2026-01-01/record.txt',
		'public/record.jsonl',
		'assets/session.jsonl',
		'PUBLIC/RUNS/2026-01-01/record.txt',
		'public/RECORD.JSONL',
		'assets/Session.Jsonl',
	];
	assert.deepEqual(publicTreeViolations(paths), [
		'tracked retained run path "public/runs/2026-01-01/record.txt"',
		'forbidden retained-data basename "public/record.jsonl"',
		'forbidden retained-data basename "assets/session.jsonl"',
		'tracked retained run path "PUBLIC/RUNS/2026-01-01/record.txt"',
		'forbidden retained-data basename "public/RECORD.JSONL"',
		'forbidden retained-data basename "assets/Session.Jsonl"',
	]);
});

test('compact and wrapped Bot record sequences are rejected in maintained public content', () => {
	const eventKey = ['ev', 'ent'].join('');
	const compact = [
		JSON.stringify({ [eventKey]: 'run_start', run: 'copied' }),
		JSON.stringify({ [eventKey]: 'run_end', exit: 0 }),
	].join('\n');
	const wrapped = [
		'# Innocent title',
		'```json',
		JSON.stringify({ [eventKey]: 'stage_start', stage: '01-work' }, null, 2),
		JSON.stringify({ [eventKey]: 'stage_end', exit: 0 }),
		'```',
	].join('\n');
	assert.deepEqual(publicTreeViolations(['docs/src/content/docs/data.txt'], () => compact), [
		'retained Bot record structure "docs/src/content/docs/data.txt"',
	]);
	assert.deepEqual(publicTreeViolations(['docs/src/content/docs/guide.md'], () => wrapped), [
		'retained Bot record structure "docs/src/content/docs/guide.md"',
	]);
});

test('neutral filenames in unrelated directories receive structural inspection', () => {
	const eventKey = ['ev', 'ent'].join('');
	const botRecord = `${JSON.stringify({ [eventKey]: 'run_start' })}\n${JSON.stringify({ [eventKey]: 'run_end' })}\n`;
	const piSession = JSON.stringify({
		type: 'message',
		message: { role: 'assistant', content: 'copied' },
	});
	assert.deepEqual(publicTreeViolations(['misc/payload'], () => botRecord), [
		'retained Bot record structure "misc/payload"',
	]);
	assert.deepEqual(publicTreeViolations(['unrelated/data.bin'], () => piSession), [
		'retained Pi session structure "unrelated/data.bin"',
	]);
});

test('tests, conformance siblings, and historical records receive structural inspection', () => {
	const eventKey = ['ev', 'ent'].join('');
	const botRecord = `${JSON.stringify({ [eventKey]: 'stage_start' })}\n${JSON.stringify({ [eventKey]: 'stage_end' })}\n`;
	const paths = [
		'bot/tests/fixture',
		'specification/conformance/accept/case/assembly/evidence',
		'sdlc/records/9999-history.md',
	];
	assert.deepEqual(publicTreeViolations(paths, () => botRecord), paths.map(
		(path) => `retained Bot record structure "${path}"`,
	));
});

test('both Pi session shapes and tool-result messages are rejected', () => {
	const direct = JSON.stringify({
		type: 'message',
		message: { role: 'assistant', content: [{ type: 'text', text: 'copied' }] },
	});
	const ordinaryTransaction = JSON.stringify([
		{ kind: 'entry', entry: { type: 'message', message: { role: 'user', content: 'copied' } } },
	]);
	const toolTransaction = JSON.stringify([
		{ kind: 'entry', entry: { type: 'message', message: { role: 'toolResult', content: [] } } },
	]);
	assert.deepEqual(publicTreeViolations(['docs/src/data/direct.json'], () => direct), [
		'retained Pi session structure "docs/src/data/direct.json"',
	]);
	assert.deepEqual(publicTreeViolations(['docs/src/content/docs/ordinary.md'], () => `\`\`\`json\n${ordinaryTransaction}\n\`\`\``), [
		'retained Pi session structure "docs/src/content/docs/ordinary.md"',
	]);
	assert.deepEqual(publicTreeViolations(['docs/src/content/docs/tool.md'], () => `\`\`\`json\n${toolTransaction}\n\`\`\``), [
		'retained Pi session structure "docs/src/content/docs/tool.md"',
	]);
});

test('reviewed synthetic fixtures pass only at their pinned bytes', () => {
	const conformancePath = 'specification/conformance/records/v1/record.jsonl';
	const walkthroughPath = 'docs/src/data/synthetic-walkthrough-record.json';
	const fixtureBytes = new Map([
		[conformancePath, readFileSync(join(repository, conformancePath), 'utf8')],
		[walkthroughPath, readFileSync(join(repository, walkthroughPath), 'utf8')],
	]);
	assert.deepEqual(publicTreeViolations([...fixtureBytes.keys()], (path) => fixtureBytes.get(path)), []);
	for (const [path, content] of fixtureBytes) {
		assert.deepEqual(publicTreeViolations([path], () => `${content} `), [
		`reviewed synthetic fixture digest changed "${path}"`,
		]);
	}
	const eventKey = ['ev', 'ent'].join('');
	const copiedRecord = `${JSON.stringify({ [eventKey]: 'run_start' })}\n${JSON.stringify({ [eventKey]: 'run_end' })}\n`;
	assert.deepEqual(publicTreeViolations([walkthroughPath], () => copiedRecord), [
		`reviewed synthetic fixture digest changed "${walkthroughPath}"`,
	]);
});

test('historical prose classes remain excluded', () => {
	const paths = [
		'sdlc/records/9999-example.md',
		'sdlc/tickets/archive/9999-example.md',
		'sdlc/planning/archive/example.md',
		'sdlc/planning/bot-contraction/records/9999-example.md',
		'sdlc/planning/bot-contraction/baseline.md',
	];
	assert.deepEqual(publicTreeViolations(paths, () => hostile), []);
});

test('all text paths are read while private-token policy keeps its explicit prose classes', () => {
	const paths = [
		'README.mdx',
		'smoke/notes.md',
		'sdlc/planning/plan.txt',
		'sdlc/tickets/example.md',
	];
	const read = [];
	assert.deepEqual(publicTreeViolations(paths, (path) => {
		read.push(path);
		return hostile;
	}), []);
	assert.deepEqual(read, paths);
});

test('the exact security contact is allowed only in SECURITY.md', () => {
	const contact = ['imau', 'rer@gmail.com'].join('');
	assert.deepEqual(publicTreeViolations(['SECURITY.md'], () => contact), []);
	assert.deepEqual(publicTreeViolations(['README.md'], () => contact), ['forbidden public prose "README.md"']);
	assert.deepEqual(publicTreeViolations(['SECURITY.md'], () => contact.toUpperCase()), ['forbidden public prose "SECURITY.md"']);
	assert.deepEqual(publicTreeViolations(['SECURITY.md'], () => `Contact ${contact} or imaurer.`), ['forbidden public prose "SECURITY.md"']);
});

test('distinctive tokens reject case changes and punctuation', () => {
	const rejected = [
		'TRIALS 42', 'Trials42', 'GENOMONCOLOGY!', '(VarClassify)', 'bioMCP,',
		'PICOHR.', 'RoloDex?', 'factory2;', 'IMAURER:',
		'Factory!', 'Deck.', 'Nucleus?', 'Librarian,', 'BioData;',
		'/home/ian/project', '/Users/ian/project',
	];
	for (const [index, content] of rejected.entries()) {
		const path = `sdlc/issues/${index}.md`;
		assert.deepEqual(publicTreeViolations([path], () => content), [`forbidden public prose "${path}"`], content);
	}
});

test('the policy allows generic lowercase words and embedded token text', () => {
	const allowed = [
		'factory deck nucleus librarian biodata',
		'FACTORY DECK NUCLEUS LIBRARIAN BIODATA',
		'prefactory postdeck multinucleus librarians biodatabase',
		'genomoncology_client trials_42 factory2Runner',
		'@example/biomcptools picohrjs rolodexical',
		'@mariozechner/pi-coding-agent node:sqlite package.json',
	];
	for (const content of allowed) {
		assert.deepEqual(publicTreeViolations(['README.md'], () => content), [], content);
	}
});

test('a covered symlink is scanned as stored text without following it', () => {
	const temporary = temporaryRepository();
	try {
		symlinkSync(hostile, join(temporary, 'README.md'));
		execFileSync('git', ['add', 'README.md'], { cwd: temporary });
		assert.deepEqual(checkPublicTree(temporary), ['forbidden public prose "README.md"']);
	} finally {
		rmSync(temporary, { recursive: true, force: true });
	}
});

test('covered non-UTF-8 and NUL-containing files fail as non-text', () => {
	const temporary = temporaryRepository();
	try {
		writeFileSync(join(temporary, 'README.md'), Buffer.from([0xc3, 0x28]));
		writeFileSync(join(temporary, 'SECURITY.md'), Buffer.from('clean\0text'));
		mkdirSync(join(temporary, 'docs', 'src', 'data'), { recursive: true });
		writeFileSync(join(temporary, 'docs', 'src', 'data', 'display.json'), Buffer.from([0xff]));
		execFileSync('git', ['add', 'README.md', 'SECURITY.md', 'docs/src/data/display.json'], { cwd: temporary });
		assert.deepEqual(checkPublicTree(temporary), [
			'non-text public prose "README.md"',
			'non-text public prose "SECURITY.md"',
			'non-text public prose "docs/src/data/display.json"',
		]);
	} finally {
		rmSync(temporary, { recursive: true, force: true });
	}
});

test('a covered tracked path that cannot be read fails with a named diagnostic', () => {
	const temporary = temporaryRepository();
	try {
		writeFileSync(join(temporary, 'README.md'), 'clean');
		execFileSync('git', ['add', 'README.md'], { cwd: temporary });
		unlinkSync(join(temporary, 'README.md'));
		assert.match(checkPublicTree(temporary)[0], /^unable to read public prose "README\.md": /);
	} finally {
		rmSync(temporary, { recursive: true, force: true });
	}
});

test('a generic path is structurally inspected when it contains text', () => {
	const read = [];
	assert.deepEqual(publicTreeViolations(['fixtures/evidence.bin', 'README.md'], (path) => {
		read.push(path);
		return 'clean';
	}), []);
	assert.deepEqual(read, ['fixtures/evidence.bin', 'README.md']);
});

test('an unscannable generic binary remains a binary rather than an admitted text exception', () => {
	const temporary = temporaryRepository();
	try {
		writeFileSync(join(temporary, 'asset.bin'), Buffer.from([0xff, 0x00]));
		execFileSync('git', ['add', 'asset.bin'], { cwd: temporary });
		assert.deepEqual(checkPublicTree(temporary), []);
	} finally {
		rmSync(temporary, { recursive: true, force: true });
	}
});

test('the executable returns one named diagnostic per violation', () => {
	const result = execFileSync(process.execPath, ['./scripts/check-public-tree.mjs', repository], { cwd: repository, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	assert.equal(result, '');
});
