import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const guide = join(repository, 'docs/src/content/docs/guides/first-assembly.md');
const expected = new Set([
	'reading-list/ASSEMBLY.md',
	'reading-list/flows/digest/FLOW.md',
	'reading-list/flows/digest/01-summarize.md',
	'reading-list/flows/digest/02-title.md',
]);

function blocks(source) {
	const found = new Map();
	const pattern = /```md title="([^"]+)"\n([\s\S]*?)\n```/gu;
	for (const match of source.matchAll(pattern)) found.set(match[1], `${match[2]}\n`);
	return found;
}

function run(command, args, options = {}) {
	return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
}

test('a clean local clone can materialize the tutorial blocks and check them offline', async () => {
	const root = await mkdtemp(join(tmpdir(), 'bot-tutorial-walkthrough-'));
	try {
		const source = await readFile(guide, 'utf8');
		const files = blocks(source);
		assert.deepEqual(new Set(files.keys()), expected);
		for (const match of source.matchAll(/\]\(([^)]+)\)/gu)) {
			const link = match[1] ?? '';
			if (!link.startsWith('.')) continue;
			assert.equal(existsSync(join(dirname(guide), (link.split('#')[0] ?? link))), true, link);
		}

		const clone = join(root, 'clone');
		run('git', ['clone', '--quiet', '--no-hardlinks', repository, clone]);
		run('npm', ['ci'], { cwd: join(clone, 'bot') });
		const bindir = join(root, 'bin');
		run('make', ['install', `BINDIR=${bindir}`], { cwd: clone });
		const launcher = join(bindir, 'bot');

		const assembly = join(root, 'reading-list');
		for (const [path, content] of files) {
			const target = join(assembly, path.slice('reading-list/'.length));
			await mkdir(dirname(target), { recursive: true });
			await writeFile(target, content);
		}

		const isolatedHome = join(root, 'home');
		const isolatedConfig = join(root, 'config');
		const models = run(launcher, ['model', 'list', 'openai-codex', '--json'], {
			env: { PATH: process.env.PATH, HOME: root, BOT_HOME: isolatedHome, XDG_CONFIG_HOME: isolatedConfig },
		});
		const modelDocument = JSON.parse(models.trim().split('\n')[0]);
		const first = modelDocument.data[0];
		assert.equal(typeof first.provider, 'string');
		assert.equal(typeof first.model, 'string');
		await mkdir(isolatedHome, { recursive: true });
		await writeFile(join(isolatedHome, 'config.yaml'), `intelligences:\n  default:\n    provider: ${first.provider}\n    model: ${first.model}\n    reasoning: low\n`);

		const check = run(launcher, ['assembly', 'check', join(assembly, 'digest')], {
			env: { PATH: process.env.PATH, HOME: root, BOT_HOME: isolatedHome, XDG_CONFIG_HOME: isolatedConfig, XDG_CACHE_HOME: join(root, 'cache') },
		});
		assert.match(check, /01-summarize/u);
		assert.match(check, /02-title/u);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
