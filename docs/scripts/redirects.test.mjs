// The retired URL surface, proved against the built site rather than against
// the configuration that produced it. Astro reports nothing for a redirect
// whose target does not exist, and nothing at all for a page that simply
// stopped being built, so this test builds the site and reads the HTML.
//
// The sidebar tests (ticket 0287, item 5) share this file's one build: two
// `node --test` files each calling `buildSite()` at module top level paid for
// two Astro builds per gate, with no wall-time saving since they overlapped,
// but each cost a core. One build now serves both.
import assert from 'node:assert/strict';
import { readFile, rm, stat } from 'node:fs/promises';
import test, { after } from 'node:test';
import { join } from 'node:path';
import { buildSite, docs } from './build-site.mjs';

// Every authored slug the site published before the 2026-09-14 rewrite, and
// the page that answers for it now. The generated specification slugs did not
// change, so none of them appears here.
const retired = new Map([
	['guides/first-assembly', 'start/install'],
	['guides/install-and-use', 'start/run-the-example'],
	['guides/authoring-assemblies', 'build/stages-and-checks'],
	['format-and-runtime', 'understand/format-and-runtime'],
	['principles', 'understand/principles'],
	['format/explore', 'build/explore'],
	['format/refusals-explorer', 'operate/refusals-explorer'],
	['reference/invocation', 'reference/commands'],
	['reference/resume', 'reference/commands'],
	['reference/inspection', 'operate/reading-a-record'],
	['reference/management', 'build/sharing'],
	['reference/models', 'operate/providers-and-credentials'],
	['reference/auth', 'operate/providers-and-credentials'],
	['reference/agent-tools', 'operate/before-you-pilot-it'],
	['reference/trust-boundary', 'operate/before-you-pilot-it'],
	['reference/limits', 'operate/before-you-pilot-it'],
]);

// One build for the whole file. `sh sdlc/scripts/install` installs these
// dependencies, so a prepared tree can always do this.
const { root, dist } = await buildSite();
after(() => rm(root, { recursive: true, force: true }));

async function html(pathname) {
	return readFile(join(dist, pathname.replace(/^\/|\/$/gu, ''), 'index.html'), 'utf8');
}

async function built(pathname) {
	try {
		const facts = await stat(join(dist, pathname.replace(/^\/|\/$/gu, ''), 'index.html'));
		return facts.isFile();
	} catch {
		return false;
	}
}

test('every retired URL builds a page that sends the reader to its replacement', async () => {
	const faults = [];
	for (const [slug, target] of retired) {
		const source = `/${slug}/`;
		const destination = `/${target}/`;
		if (!(await built(source))) {
			faults.push(`${source}: nothing built, so the URL 404s`);
			continue;
		}
		const page = await html(source);
		if (!page.includes(`content="0;url=${destination}"`)) {
			faults.push(`${source}: no meta refresh to ${destination}`);
		}
		if (!page.includes(`href="${destination}"`)) {
			faults.push(`${source}: no link to ${destination}`);
		}
	}
	assert.deepEqual(faults, []);
});

test('every redirect target is itself a built page', async () => {
	const missing = [];
	for (const target of new Set(retired.values())) {
		if (!(await built(`/${target}/`))) missing.push(target);
	}
	assert.deepEqual(missing, []);
});

test('a redirect page carries the canonical link and keeps itself out of search', async () => {
	const page = await html('/guides/first-assembly/');
	assert.match(page, /<link rel="canonical" href="https:\/\/botassembly\.org\/start\/install\/">/u);
	assert.match(page, /<meta name="robots" content="noindex">/u);
});

test('no retired URL builds a real page that would shadow its redirect', async () => {
	const shadowed = [];
	for (const slug of retired.keys()) {
		const page = await html(`/${slug}/`);
		if (!page.startsWith('<!doctype html><title>Redirecting to:')) shadowed.push(slug);
	}
	assert.deepEqual(shadowed, []);
});

test('the built site declares no redirect this list does not name', async () => {
	const config = await readFile(join(docs, 'astro.config.mjs'), 'utf8');
	const start = config.indexOf('redirects: {');
	assert.ok(start >= 0, 'astro.config.mjs declares no redirects');
	const block = config.slice(start, config.indexOf('\n\t},', start));
	const declared = [...block.matchAll(/'([^']+)':\s*'([^']+)'/gu)].map((match) => match[1]);
	assert.deepEqual(
		declared.filter((source) => !retired.has(source.replace(/^\/|\/$/gu, ''))),
		[],
	);
	assert.equal(declared.length, retired.size);
});

// The sidebar the reader sees, read out of the built HTML. Starlight reports
// nothing for a group renamed or a page moved to another group, and the
// configuration text is not the navigation; the rendered nav is.
function sidebarOf(page) {
	const opening = page.indexOf('<ul class="top-level');
	const nav = page.slice(opening, page.indexOf('</nav>', opening));
	// The Reference group nests the generated specification group inside its
	// own <details>, so depth decides which sections are the top level.
	const groups = [];
	let depth = 0;
	let section = '';
	for (const piece of nav.split(/(<details|<\/details>)/u)) {
		if (piece === '<details') {
			depth += 1;
		} else if (piece === '</details>') {
			depth -= 1;
			if (depth === 0) {
				const label = /<span class="large[^"]*">([^<]+)<\/span>/u.exec(section);
				const items = [...section.matchAll(/<a href="([^"]+)"[^>]*><span[^>]*>([^<]+)<\/span><\/a>/gu)]
					.map((match) => ({ label: match[2], href: match[1] }));
				groups.push({ label: label?.[1], items });
				section = '';
			}
		}
		if (depth >= 1) section += piece;
	}
	return groups;
}

const sidebar = sidebarOf(await html('/start/install/'));

test('the sidebar carries the six groups in the reader order', () => {
	assert.deepEqual(
		sidebar.map(({ label }) => label),
		['Start', 'Build', 'Operate', 'Understand', 'Reference', 'Project'],
	);
});

test('Start walks from what Bot is to the reader writing one', () => {
	const start = sidebar.find(({ label }) => label === 'Start');
	assert.deepEqual(start.items, [
		{ label: 'What it is', href: '/' },
		{ label: 'Why not a script', href: '/start/why-not-a-script/' },
		{ label: 'Install', href: '/start/install/' },
		{ label: 'Run the shipped example', href: '/start/run-the-example/' },
		{ label: 'Write your own', href: '/start/write-your-own/' },
	]);
});

test('every group after Start lists its own pages', () => {
	const groups = new Map(sidebar.map(({ label, items }) => [label, items.map((item) => item.href)]));
	assert.deepEqual(groups.get('Build'), [
		'/build/stages-and-checks/',
		'/build/control-flow/',
		'/build/skills-and-slots/',
		'/build/sharing/',
		'/build/explore/',
	]);
	assert.deepEqual(groups.get('Operate'), [
		'/operate/reading-a-record/',
		'/operate/providers-and-credentials/',
		'/operate/when-it-refuses/',
		'/operate/refusals-explorer/',
		'/operate/before-you-pilot-it/',
	]);
	assert.deepEqual(groups.get('Understand'), [
		'/understand/folder-in-record-out/',
		'/understand/format-and-runtime/',
		'/understand/principles/',
	]);
	assert.deepEqual(groups.get('Project'), ['/project/development/']);
	assert.equal(groups.get('Reference')[0], '/reference/commands/');
});
