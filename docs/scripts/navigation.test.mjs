// Two guards the nav split needs and the build does not give. Astro reports
// nothing for a root-relative link that goes nowhere, and Starlight reports
// nothing for a page listed in two sidebar groups or in none.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const docs = dirname(dirname(fileURLToPath(import.meta.url)));
const content = join(docs, 'src', 'content', 'docs');

async function markdown(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...await markdown(path));
		} else if (/\.mdx?$/u.test(entry.name)) {
			files.push(path);
		}
	}
	return files.sort();
}

function slugOf(path) {
	return relative(content, path).replace(/\.mdx?$/u, '').replaceAll('\\', '/');
}

function slugify(heading) {
	return heading
		.trim()
		.toLowerCase()
		.replaceAll(/[^\p{L}\p{N} _-]/gu, '')
		.replaceAll(/\s+/gu, '-');
}

function outsideFences(markdownText) {
	let fence;
	return markdownText.replaceAll('\r\n', '\n').split('\n').filter((line) => {
		const edge = /^\s*(`{3,}|~{3,})/.exec(line);
		if (fence) {
			if (edge && line.trim().startsWith(fence)) fence = undefined;
			return false;
		}
		if (edge) {
			fence = edge[1];
			return false;
		}
		return true;
	});
}

function anchorsOf(lines) {
	const seen = new Map();
	const anchors = new Set();
	for (const line of lines) {
		const heading = /^#{1,6} (.+)$/u.exec(line);
		if (!heading) continue;
		const base = slugify(heading[1].replaceAll(/\[([^\]]*)\]\([^()]*\)/gu, '$1'));
		const count = seen.get(base) ?? 0;
		seen.set(base, count + 1);
		anchors.add(count === 0 ? base : `${base}-${String(count)}`);
	}
	return anchors;
}

test('every root-relative documentation link resolves to a page and an anchor', async () => {
	const files = await markdown(content);
	const pages = new Map();
	const bodies = new Map();
	for (const file of files) {
		const text = await readFile(file, 'utf8');
		const lines = outsideFences(text);
		pages.set(slugOf(file), anchorsOf(lines));
		bodies.set(slugOf(file), lines);
	}
	// The home page's components carry links of their own.
	for (const file of await markdown(join(docs, 'src', 'components')).catch(() => [])) {
		bodies.set(relative(docs, file), outsideFences(await readFile(file, 'utf8')));
	}

	const broken = [];
	for (const [source, lines] of bodies) {
		for (const line of lines) {
			for (const match of line.matchAll(/\]\((\/[^)\s]*)\)/gu)) {
				const [target, anchor] = match[1].split('#');
				const slug = target.replace(/^\/|\/$/gu, '');
				if (slug === '' || slug.includes('.')) continue;
				const anchors = pages.get(slug);
				if (!anchors) {
					broken.push(`${source}: no page at ${match[1]}`);
				} else if (anchor && !anchors.has(anchor)) {
					broken.push(`${source}: no anchor #${anchor} on /${slug}/`);
				}
			}
		}
	}
	assert.deepEqual(broken, []);
});

test('every documentation page appears in exactly one sidebar group', async () => {
	const config = await readFile(join(docs, 'astro.config.mjs'), 'utf8');
	// Search for the close of the starlight() call from the sidebar onwards.
	// Plugin options above it close at a deeper indent that also ends in
	// `\t\t}),`, and searching from zero found that one instead.
	const start = config.indexOf('sidebar: [');
	const sidebar = config.slice(start, config.indexOf('\n\t\t}),', start));
	const listed = [
		...[...sidebar.matchAll(/slug: '([^']+)'/gu)].map((match) => match[1]),
	];
	const directories = [...sidebar.matchAll(/autogenerate: \{ directory: '([^']+)' \}/gu)]
		.map((match) => match[1]);

	// Blog posts are not sidebar pages. starlight-blog owns their navigation:
	// the post list, the tag and author pages, and the prev/next links.
	const pages = (await markdown(content)).map(slugOf)
		.filter((slug) => slug !== 'index' && !slug.startsWith('blog/'));
	for (const slug of pages) {
		const directory = slug.includes('/') ? slug.slice(0, slug.indexOf('/')) : '';
		if (directories.includes(directory)) listed.push(slug);
	}

	const counts = new Map();
	for (const slug of listed) counts.set(slug, (counts.get(slug) ?? 0) + 1);

	assert.deepEqual(
		pages.filter((slug) => (counts.get(slug) ?? 0) !== 1)
			.map((slug) => `${slug}: listed ${String(counts.get(slug) ?? 0)} times`),
		[],
	);
	assert.deepEqual([...counts.keys()].filter((slug) => !pages.includes(slug)), []);
});
