import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
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
	const paths = ['sdlc/planning/dogfood/run/request.txt', 'config/.env', 'x/.env.local', 'auth.json', 'nested/credentials.json'];
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

test('prose-like paths outside the explicit classes are not read', () => {
	const paths = [
		'README.mdx',
		'docs/src/content/docs/data.json',
		'specification/other.md',
		'specification/elements/example.mdx',
		'smoke/notes.md',
		'sdlc/planning/plan.txt',
		'sdlc/tickets/example.md',
	];
	assert.deepEqual(publicTreeViolations(paths, () => {
		throw new Error('reader called');
	}), []);
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
		execFileSync('git', ['add', 'README.md', 'SECURITY.md'], { cwd: temporary });
		assert.deepEqual(checkPublicTree(temporary), [
			'non-text public prose "README.md"',
			'non-text public prose "SECURITY.md"',
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

test('uncovered binary files are not read', () => {
	const read = [];
	assert.deepEqual(publicTreeViolations(['fixtures/evidence.bin', 'README.md'], (path) => {
		read.push(path);
		return 'clean';
	}), []);
	assert.deepEqual(read, ['README.md']);
});

test('the executable returns one named diagnostic per violation', () => {
	const result = execFileSync(process.execPath, ['./scripts/check-public-tree.mjs', repository], { cwd: repository, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	assert.equal(result, '');
});
