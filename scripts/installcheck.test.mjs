import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repository = dirname(dirname(fileURLToPath(import.meta.url)));

test('installcheck accepts a scratch spelling whose physical path differs', async () => {
	const root = await mkdtemp(join(tmpdir(), 'bot-installcheck-alias-'));
	const physical = join(root, 'physical');
	const alias = join(root, 'alias');
	try {
		await symlink(physical, alias, 'dir').catch(async () => {
			await rm(root, { recursive: true, force: true });
			throw new Error('fixture could not create its directory alias');
		});
		// The symlink target may be absent when the link is made.
		await mkdir(physical);
		const result = spawnSync('sh', [join(repository, 'scripts', 'installcheck.sh')], {
			cwd: repository,
			env: { ...process.env, TMPDIR: alias },
			encoding: 'utf8',
		});
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /installed from a path with a space, ran, and uninstalled/u);
		assert.deepEqual(await readdir(physical), []);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
