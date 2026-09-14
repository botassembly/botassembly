#!/usr/bin/env node
// Walks the built site and follows every internal link. Astro reports nothing
// for a root-relative href that goes nowhere, and navigation.test.mjs only sees
// the markdown sources, so neither catches a link a component or a redirect
// produced. Run it after `npm run build`:
//
//   node scripts/check-links.mjs
//
// Exits 0 when every internal link and anchor resolves, 1 otherwise.
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const docs = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = resolve(process.argv[2] ?? join(docs, 'dist'));

async function htmlFiles(directory) {
	const found = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) found.push(...(await htmlFiles(path)));
		else if (entry.name.endsWith('.html')) found.push(path);
	}
	return found.sort();
}

async function exists(path) {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

// A served path resolves to the file itself or to its index.html.
async function resolveTarget(pathname) {
	const trimmed = pathname.replace(/^\/+/u, '');
	const direct = join(dist, trimmed);
	if (trimmed !== '' && (await exists(direct)) && !trimmed.endsWith('/')) {
		const facts = await stat(direct);
		if (facts.isFile()) return direct;
	}
	const index = join(dist, trimmed, 'index.html');
	return (await exists(index)) ? index : undefined;
}

function idsOf(html) {
	const ids = new Set();
	for (const match of html.matchAll(/\sid="([^"]+)"/gu)) ids.add(match[1]);
	for (const match of html.matchAll(/\sname="([^"]+)"/gu)) ids.add(match[1]);
	return ids;
}

const broken = [];
const anchors = new Map();
const pages = await htmlFiles(dist);
if (pages.length === 0) {
	process.stderr.write(`check-links: no built pages under ${dist}; run npm run build first\n`);
	process.exit(1);
}

for (const page of pages) anchors.set(page, idsOf(await readFile(page, 'utf8')));

for (const page of pages) {
	const html = await readFile(page, 'utf8');
	const source = relative(dist, page);
	for (const match of html.matchAll(/(?:href|src)="([^"]+)"/gu)) {
		const raw = match[1];
		if (!raw.startsWith('/') || raw.startsWith('//')) continue;
		const [pathname, fragment] = raw.split('#');
		const target = await resolveTarget(decodeURIComponent(pathname));
		if (target === undefined) {
			broken.push(`${source}: no page at ${raw}`);
			continue;
		}
		if (fragment === undefined || fragment === '') continue;
		const ids = anchors.get(target) ?? idsOf(await readFile(target, 'utf8'));
		if (!ids.has(decodeURIComponent(fragment))) broken.push(`${source}: no anchor #${fragment} on ${pathname}`);
	}
}

if (broken.length > 0) {
	for (const fault of broken) process.stderr.write(`check-links: ${fault}\n`);
	process.stderr.write(`check-links: ${String(broken.length)} broken internal links\n`);
	process.exit(1);
}
process.stdout.write(`check-links: ${String(pages.length)} pages, no broken internal link or anchor\n`);
