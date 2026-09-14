// The sidebar the reader sees, read out of the built HTML. Starlight reports
// nothing for a group renamed or a page moved to another group, and the
// configuration text is not the navigation; the rendered nav is.
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import test, { after } from 'node:test';
import { join } from 'node:path';
import { buildSite } from './build-site.mjs';

const { root, dist } = await buildSite();
after(() => rm(root, { recursive: true, force: true }));

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

const sidebar = sidebarOf(await readFile(join(dist, 'start', 'install', 'index.html'), 'utf8'));

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
