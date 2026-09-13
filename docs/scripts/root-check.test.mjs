import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const repository = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function independentMakeEnvironment(source) {
	const environment = { ...source };
	delete environment.MAKEFLAGS;
	delete environment.MFLAGS;
	delete environment.MAKELEVEL;
	return environment;
}

function assertRootCheck(source) {
	const result = spawnSync('make', ['-n', 'check'], {
		cwd: repository,
		encoding: 'utf8',
		env: independentMakeEnvironment(source),
	});
	assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
	assert.deepEqual(result.stdout.trim().split('\n'), [
		'sh sdlc/scripts/spec',
		'sh sdlc/scripts/lint',
		'sh sdlc/scripts/test',
	]);
}

test('the root complete check runs specification, project lint, and project tests', () => {
	assertRootCheck(process.env);
});

test('the root check ignores inherited recursive Make state and preserves other environment', () => {
	const source = { ...process.env, MAKEFLAGS: 'w', MFLAGS: '-w', MAKELEVEL: '9', ROOT_CHECK_MARKER: 'kept' };
	assert.deepEqual(independentMakeEnvironment(source).ROOT_CHECK_MARKER, 'kept');
	assertRootCheck(source);
});
