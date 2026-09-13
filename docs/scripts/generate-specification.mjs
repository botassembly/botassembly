import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const productionDocs = dirname(dirname(fileURLToPath(import.meta.url)));
const productionRepository = dirname(productionDocs);

const pages = [
	{
		file: 'overview.md',
		condenseTables: true,
		title: 'Overview',
		description: 'What the Bot Assembly specification is, the bet it is built on, and how to read it.',
		order: 1,
		sources: ['specification/README.md'],
	},
	{
		file: 'example.md',
		title: 'The Worked Example',
		description: 'The parts of the format assembled into one small, real assembly, walked end to end.',
		order: 2,
		sources: ['specification/example.md'],
	},
	{
		file: 'structure.md',
		title: 'Structure',
		description: 'The containment story: a stage is one step, a flow is a numbered folder of stages, an assembly holds the flows, and a home is where assemblies and runs live.',
		order: 3,
		sources: [
			'specification/elements/stage.md',
			'specification/elements/flow.md',
			'specification/elements/assembly.md',
			'specification/elements/home.md',
		],
	},
	{
		file: 'slots-and-skills.md',
		title: 'Slots and Skills',
		description: "The slot vocabulary a stage's text can use, and the capability files an agent is told exist and reads only when it reaches for them.",
		order: 4,
		sources: ['specification/elements/slots.md', 'specification/elements/skills.md'],
	},
	{
		file: 'graph.md',
		title: 'The Graph',
		description: 'Placement is the control flow: how folder order runs stages, and the sentinel files — LOOP, CHOOSE, PARALLEL, FANOUT, DESCEND — and subflows that bend it.',
		order: 5,
		sources: [
			'specification/elements/graph.md',
			'specification/elements/loop.md',
			'specification/elements/choose.md',
			'specification/elements/parallel.md',
			'specification/elements/fanout.md',
			'specification/elements/descend.md',
			'specification/elements/subflow.md',
		],
	},
	{
		file: 'gating.md',
		title: 'Gating',
		description: 'The three checks a stage\'s output must pass — checklist, schema, gate — what a failure does, and the before/success/failure hooks around them.',
		order: 6,
		sources: [
			'specification/elements/gates.md',
			'specification/elements/checklist.md',
			'specification/elements/schema.md',
			'specification/elements/gate.md',
			'specification/elements/hooks.md',
		],
	},
	{
		file: 'running.md',
		title: 'Running',
		description: 'The contract every runtime meets: how a run starts, how options resolve, what the agent is told and not told, and the credentials a run calls a model with.',
		order: 7,
		sources: [
			'specification/elements/runtime.md',
			'specification/elements/invocation.md',
			'specification/elements/prompt.md',
			'specification/elements/auth.md',
		],
	},
	{
		file: 'refusals.md',
		title: 'Refusals',
		description: 'How a malformed assembly is reported: the refusal vocabulary, one sentence per code, and why a runtime refuses instead of guessing.',
		order: 8,
		sources: ['specification/elements/refusals.md'],
	},
	{
		file: 'record.md',
		title: 'The Record',
		description: 'What a run writes down — the sealed record of what ran, what judged it, and what it cost — and the session transcript of one stage.',
		order: 9,
		sources: ['specification/elements/record.md', 'specification/elements/session.md'],
	},
	{
		file: 'invariants.md',
		title: 'Invariants',
		description: 'The numbered laws that hold everywhere in the format — the normative appendix every other chapter rests on.',
		order: 10,
		sources: ['specification/elements/invariants.md'],
	},
	{
		file: 'conformance.md',
		title: 'Conformance',
		description: 'The corpus a runtime is checked against: assemblies it must accept and assemblies it must refuse, for the stated reasons.',
		order: 11,
		sources: ['specification/conformance.md'],
	},
];

const excluded = new Set([
	'specification/CHANGELOG.md',
	'specification/elements/invariants-witnesses.md',
	'specification/elements/inspection.md',
	'specification/elements/management.md',
]);
const canonicalExcluded = new Map([
	[
		'specification/CHANGELOG.md',
		'https://github.com/botassembly/botassembly/blob/main/specification/CHANGELOG.md',
	],
	[
		'specification/elements/invariants-witnesses.md',
		'https://github.com/botassembly/botassembly/blob/main/specification/elements/invariants-witnesses.md',
	],
]);
const referencePages = new Map([
	['specification/elements/inspection.md', '/reference/inspection/'],
	['specification/elements/management.md', '/reference/management/'],
]);

// Starlight slugs a heading the way GitHub does: lower case, punctuation
// dropped, spaces hyphenated. `FANOUT.md` becomes `fanoutmd`, which is the
// anchor the hand-written pages already link to.
function slugify(heading) {
	return heading
		.trim()
		.toLowerCase()
		.replaceAll(/[^\p{L}\p{N} _-]/gu, '')
		.replaceAll(/\s+/gu, '-');
}

function firstHeading(source, content) {
	const match = /^# (.+)$/mu.exec(content.replaceAll('\r\n', '\n'));
	if (!match) {
		throw new Error(`mapped source has no top-level heading: ${source}`);
	}
	return match[1].trim();
}

// A page built from one source needs no anchor; the route is the section. A
// page that concatenates several needs one anchor per source, so a link can
// land on the document the reader asked for instead of the top of a 50 KB
// chapter.
function sectionsOf(page, contents) {
	return page.sources.map((source, index) => {
		const heading = firstHeading(source, contents.get(source));
		const repeated = index === 0 && repeatsTitle(heading, page.title);
		return { source, heading, anchor: repeated ? '' : `#${slugify(heading)}` };
	});
}

// A source section whose published body is not the source's own. The
// specification is normative prose and stays as written; the site carries a
// summary and a link where the full text would bury a reader. Keyed on the
// heading text, so a renamed section fails the build instead of shipping the
// long body again. Recorded in sdlc/planning/notes/2026-09-11-third-review-content.md.
const sectionSummaries = new Map([
	[
		'Operational record conformance',
		'The runtime ships deterministic tests that stand in for the parts of the format the static corpus cannot reach: what a running writer emits, what a sealed record must hold, and how stages, retries, containers, and child runs settle. The full test notes are the source of this page, [`specification/conformance.md`](https://github.com/botassembly/botassembly/blob/main/specification/conformance.md) in the repository.',
	],
]);

// Replace the body of a named section, heading and level kept, everything up
// to the next heading of the same or a higher level swapped for the summary.
function summarizeSections(content, replaced) {
	const lines = content.replaceAll('\r\n', '\n').split('\n');
	const output = [];
	let skipping;
	for (const line of lines) {
		const heading = /^(#{1,6})\s+(.+?)\s*$/u.exec(line);
		if (skipping) {
			if (!heading || heading[1].length > skipping) {
				continue;
			}
			skipping = undefined;
		}
		output.push(line);
		if (heading && sectionSummaries.has(heading[2])) {
			output.push('', sectionSummaries.get(heading[2]), '');
			replaced.add(heading[2]);
			skipping = heading[1].length;
		}
	}
	return output.join('\n');
}

// The page's frontmatter title is rendered as the H1, so a source whose own
// top-level heading says the same thing renders it twice. Drop the demoted
// copy; the anchors it owned point at the top of the page instead.
function repeatsTitle(heading, title) {
	return heading.trim().toLowerCase() === title.trim().toLowerCase();
}

function dropTitleHeading(content) {
	return content.replace(/^##\s+.+\n+/u, '');
}

function tableBlocks(lines) {
	const blocks = [];
	let start;
	for (const [index, line] of lines.entries()) {
		const isRow = line.startsWith('|');
		if (isRow && start === undefined) {
			start = index;
		} else if (!isRow && start !== undefined) {
			blocks.push({ start, end: index });
			start = undefined;
		}
	}
	if (start !== undefined) {
		blocks.push({ start, end: lines.length });
	}
	return blocks.filter((block) => block.end - block.start > 2);
}

// The overview shipped six tables, thirty-four rows, every row a bare link to
// the top of a page that holds several documents. The rows become one line of
// anchored links per section: same destinations, each landing on its own
// document, without the table chrome between the reader and the chapter.
function condenseTables(source, content, destinations) {
	const lines = content.replaceAll('\r\n', '\n').split('\n');
	for (const block of tableBlocks(lines).reverse()) {
		const links = [];
		for (const line of lines.slice(block.start + 2, block.end)) {
			const cell = /^\|([^|]*)\|/u.exec(line);
			const link = cell && /\[([^\]]+)\]\(([^()\s]+)\)/u.exec(cell[1]);
			if (!link) {
				throw new Error(`overview table row without a document link in ${source}: ${line}`);
			}
			const resolved = posix.normalize(posix.join(posix.dirname(source), link[2]));
			const destination = destinations.get(resolved);
			if (!destination) {
				throw new Error(`overview table row points nowhere in ${source}: ${line}`);
			}
			links.push(`[${link[1]}](${destination})`);
		}
		lines.splice(block.start, block.end - block.start, `${links.join(' · ')}`);
	}
	return lines.join('\n');
}

function routeFor(page) {
	return `/specification/${page.file.slice(0, -3)}/`;
}

async function markdownFiles(repository, directory) {
	const files = [];
	const entries = await readdir(directory, { withFileTypes: true });
	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...await markdownFiles(repository, path));
		} else if (entry.isFile() && entry.name.endsWith('.md')) {
			files.push(relative(repository, path).replaceAll('\\', '/'));
		}
	}
	return files;
}

function isExcluded(source) {
	return excluded.has(source) || source.startsWith('specification/conformance/');
}

function sourceRoutes() {
	const routes = new Map();
	const files = new Set();
	const errors = [];

	for (const page of pages) {
		if (files.has(page.file)) {
			errors.push(`duplicate generated page: ${page.file}`);
		}
		files.add(page.file);
		for (const source of page.sources) {
			if (routes.has(source)) {
				errors.push(`duplicate mapping entry: ${source}`);
			}
			routes.set(source, routeFor(page));
		}
	}

	return { routes, errors };
}

async function validate(repository) {
	const authored = await markdownFiles(repository, join(repository, 'specification'));
	const { routes, errors } = sourceRoutes();
	const present = new Set(authored);

	for (const source of routes.keys()) {
		if (!present.has(source)) {
			errors.push(`missing mapped source: ${source}`);
		}
	}
	for (const source of authored) {
		if (!routes.has(source) && !isExcluded(source)) {
			errors.push(`unmapped specification Markdown: ${source}`);
		}
	}
	if (errors.length > 0) {
		throw new Error(errors.join('\n'));
	}

	return routes;
}

function splitDestination(destination) {
	const hash = destination.indexOf('#');
	return hash === -1
		? [destination, '']
		: [destination.slice(0, hash), destination.slice(hash)];
}

function rewriteLink(source, route, destination, routes) {
	if (destination.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(destination) || destination.startsWith('//')) {
		return destination;
	}

	const [target, anchor] = splitDestination(destination);
	if (!target.endsWith('.md')) {
		return destination;
	}
	if (target.startsWith('/')) {
		throw new Error(`unresolved Markdown link in ${source}: ${destination}`);
	}

	const relativeTarget = posix.normalize(posix.join(posix.dirname(source), target));
	const targets = [relativeTarget];
	if (!target.includes('/')) {
		targets.push(`specification/elements/${target}`);
	}

	for (const resolved of targets) {
		if (resolved.startsWith('../')) {
			continue;
		}
		if (routes.has(resolved)) {
			const targetRoute = routes.get(resolved);
			return targetRoute === route && anchor ? anchor : `${targetRoute}${anchor}`;
		}
		if (referencePages.has(resolved)) {
			return `${referencePages.get(resolved)}${anchor}`;
		}
		if (canonicalExcluded.has(resolved)) {
			return `${canonicalExcluded.get(resolved)}${anchor}`;
		}
	}

	throw new Error(`unresolved Markdown link in ${source}: ${destination}`);
}

function transform(source, content, route, routes) {
	let fence;
	const lines = content.replaceAll('\r\n', '\n').split('\n');
	const transformed = lines.map((line) => {
		if (fence) {
			const closing = new RegExp(`^\\s*${fence.character}{${fence.length},}\\s*$`);
			if (closing.test(line)) {
				fence = undefined;
			}
			return line;
		}

		const opening = /^\s*(`{3,}|~{3,})/.exec(line);
		if (opening) {
			fence = { character: opening[1][0], length: opening[1].length };
			return line;
		}

		const demoted = line.replace(/^(#{1,6})(?=\s)/, '$1#');
		return demoted.replace(/(!?\[[^\]]*\])\(([^()\s]+)\)/g, (match, label, destination) =>
			`${label}(${rewriteLink(source, route, destination, routes)})`,
		);
	});

	if (fence) {
		throw new Error(`unclosed fenced code block in ${source}`);
	}
	return transformed.join('\n').replace(/\n+$/, '');
}

function frontmatter(page) {
	return [
		'---',
		`title: "${page.title}"`,
		`description: "${page.description}"`,
		'sidebar:',
		`  order: ${page.order}`,
		'---',
	].join('\n');
}

async function read(repository, source) {
	try {
		return await readFile(join(repository, source), 'utf8');
	} catch (error) {
		throw new Error(`cannot read mapped source ${source}: ${error.message}`);
	}
}

async function generate(repository = productionRepository) {
	const routes = await validate(repository);

	const contents = new Map();
	for (const page of pages) {
		for (const source of page.sources) {
			contents.set(source, await read(repository, source));
		}
	}

	// Where a link to one source document should land: the page that holds it,
	// plus the anchor of its own section when the page holds several.
	const destinations = new Map(referencePages);
	for (const [source, url] of canonicalExcluded) {
		destinations.set(source, url);
	}
	const sections = new Map();
	for (const page of pages) {
		const pageSections = sectionsOf(page, contents);
		sections.set(page.file, pageSections);
		for (const section of pageSections) {
			destinations.set(
				section.source,
				page.sources.length > 1 ? `${routeFor(page)}${section.anchor}` : routeFor(page),
			);
		}
	}

	const replaced = new Set();
	const rendered = [];
	for (const page of pages) {
		const fragments = [];
		for (const [index, source] of page.sources.entries()) {
			const content = page.condenseTables
				? condenseTables(source, contents.get(source), destinations)
				: contents.get(source);
			const transformed = transform(source, summarizeSections(content, replaced), routeFor(page), routes);
			fragments.push(
				index === 0 && sections.get(page.file)[0].anchor === ''
					? dropTitleHeading(transformed)
					: transformed,
			);
		}
		rendered.push({
			file: page.file,
			content: `${frontmatter(page)}\n\n${fragments.join('\n\n')}\n`,
		});
	}

	for (const heading of sectionSummaries.keys()) {
		if (!replaced.has(heading)) {
			throw new Error(`summarized section is no longer in the specification: ${heading}`);
		}
	}

	const output = join(repository, 'docs', 'src', 'content', 'docs', 'specification');
	await rm(output, { recursive: true, force: true });
	await mkdir(output, { recursive: true });
	for (const page of rendered) {
		await writeFile(join(output, page.file), page.content, 'utf8');
	}
}

generate(process.argv[2]).catch((error) => {
	console.error(error.message);
	process.exitCode = 1;
});
