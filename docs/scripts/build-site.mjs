// One built site, from a copy of the sources rather than from the working
// tree. `npm run build` regenerates docs/src/content/docs/specification/ and
// docs/src/data/, so a build running beside the other tests would delete the
// pages navigation.test.mjs is reading. The copy takes about a megabyte and
// leaves the working tree alone, so any number of tests can build at once.
import { execFile } from 'node:child_process';
import { cp, mkdtemp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
export const docs = dirname(dirname(fileURLToPath(import.meta.url)));
const repository = dirname(docs);

// The generators read `specification/` and `examples/` and derive the
// repository from their own location, so the copy needs both names beside its
// own docs directory. They are read, never written, so a link is enough.
export async function buildSite() {
	const root = await mkdtemp(join(tmpdir(), 'bot-docs-build-'));
	await symlink(join(repository, 'specification'), join(root, 'specification'));
	await symlink(join(repository, 'examples'), join(root, 'examples'));
	const copy = join(root, 'docs');
	await cp(docs, copy, {
		recursive: true,
		filter: (source) => {
			const name = source.slice(docs.length + 1);
			return !name.startsWith('node_modules') && !name.startsWith('dist') && !name.startsWith('.astro');
		},
	});
	// Hard links, not a symlink: Astro resolves a dependency to its real path,
	// and a linked node_modules made the build fail on its own cache keys. The
	// links cost a fifth of a second and no disk. A copy across filesystems
	// cannot link, so that case copies the bytes.
	const modules = join(docs, 'node_modules');
	try {
		await run('cp', ['-al', modules, join(copy, 'node_modules')]);
	} catch {
		await run('cp', ['-a', modules, join(copy, 'node_modules')]);
	}

	const options = { cwd: copy, env: { ...process.env, CI: '1' } };
	for (const script of ['generate-specification.mjs', 'extract-corpus.mjs', 'extract-walkthrough.mjs']) {
		await run('node', [join(copy, 'scripts', script)], options);
	}
	await run('npx', ['astro', 'build'], options);
	return { root, dist: join(copy, 'dist') };
}
