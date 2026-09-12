import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const docs = dirname(dirname(fileURLToPath(import.meta.url)));
const repository = dirname(docs);
const generator = join(docs, 'scripts', 'generate-specification.mjs');
const fixtureSources = [
	'specification/README.md',
	'specification/example.md',
	'specification/conformance.md',
	'specification/elements/stage.md',
	'specification/elements/flow.md',
	'specification/elements/assembly.md',
	'specification/elements/home.md',
	'specification/elements/slots.md',
	'specification/elements/skills.md',
	'specification/elements/graph.md',
	'specification/elements/loop.md',
	'specification/elements/choose.md',
	'specification/elements/parallel.md',
	'specification/elements/fanout.md',
	'specification/elements/descend.md',
	'specification/elements/subflow.md',
	'specification/elements/gates.md',
	'specification/elements/checklist.md',
	'specification/elements/schema.md',
	'specification/elements/gate.md',
	'specification/elements/hooks.md',
	'specification/elements/runtime.md',
	'specification/elements/invocation.md',
	'specification/elements/prompt.md',
	'specification/elements/auth.md',
	'specification/elements/refusals.md',
	'specification/elements/record.md',
	'specification/elements/session.md',
	'specification/elements/invariants.md',
];

function generate(root) {
	return spawnSync(process.execPath, [generator, root], {
		cwd: dirname(root),
		encoding: 'utf8',
	});
}

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'botassembly-specification-'));
	try {
		for (const source of fixtureSources) {
			const destination = join(root, source);
			await mkdir(dirname(destination), { recursive: true });
			await copyFile(join(repository, source), destination);
		}
		return root;
	} catch (error) {
		await rm(root, { recursive: true, force: true });
		throw error;
	}
}

function resultText(result) {
	return `${result.stdout}\n${result.stderr}`;
}

function generatedSections(markdown, title) {
	const lines = markdown.split('\n');
	const starts = lines.flatMap((line, index) => {
		const match = /^(#+) (.+)$/u.exec(line);
		return match?.[2] === title ? [{ index, depth: match[1].length }] : [];
	});
	return starts.map((start) => {
		const end = lines.findIndex((line, index) => index > start.index
			&& new RegExp(`^#{1,${String(start.depth)}}\\s`, 'u').test(line));
		return lines.slice(start.index + 1, end < 0 ? undefined : end).join('\n');
	});
}

test('the specification page is regenerated from its source', async () => {
	const root = await fixture();
	const source = join(root, 'specification', 'elements', 'skills.md');
	const page = join(
		root,
		'docs',
		'src',
		'content',
		'docs',
		'specification',
		'slots-and-skills.md',
	);
	const marker = 'Generator regression marker: skills source reached the site.';

	try {
		const original = await readFile(source, 'utf8');
		await writeFile(source, `${original}\n## ${marker}\n\n[Read the slots](slots.md)\n`);
		const result = generate(root);
		assert.equal(result.status, 0, resultText(result));

		const generated = await readFile(page, 'utf8');
		assert.match(generated, /^---\n[\s\S]*?---\n/);
		assert.match(generated, /^title: "Slots and Skills"$/m);
		assert.match(generated, /^sidebar:\n  order: 4$/m);
		assert.match(generated, new RegExp(`### ${marker}`));
		assert.match(generated, /\[Read the slots\]\(\/specification\/slots-and-skills\/\)/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('the generator names an unmapped specification file', async () => {
	const root = await fixture();
	const relativeSource = 'specification/elements/docs-drift-proof.md';
	const source = join(root, relativeSource);

	try {
		await writeFile(source, '# Docs drift proof\n');
		const result = generate(root);
		assert.notEqual(result.status, 0, resultText(result));
		assert.match(resultText(result), new RegExp(relativeSource));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('both generated run id file sections name every run-creation command', async () => {
	const root = await fixture();
	try {
		const result = generate(root);
		assert.equal(result.status, 0, resultText(result));
		const page = await readFile(join(root, 'docs', 'src', 'content', 'docs', 'specification', 'running.md'), 'utf8');
		const sections = generatedSections(page, 'Run id file');
		assert.equal(sections.length, 2);
		for (const [index, section] of sections.entries()) {
			for (const command of ['bot run start', 'bot run resume']) {
				assert.ok(section.includes('`' + command + '`'), `section ${String(index + 1)} omits ${command}`);
			}
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('a source heading that repeats the page title is not rendered twice', async () => {
	const root = await fixture();
	try {
		const result = generate(root);
		assert.equal(result.status, 0, resultText(result));
		const directory = join(root, 'docs', 'src', 'content', 'docs', 'specification');
		for (const [file, title] of [
			['conformance.md', 'Conformance'],
			['gating.md', 'Gating'],
			['refusals.md', 'Refusals'],
			['invariants.md', 'Invariants'],
			['record.md', 'The record'],
		]) {
			const page = await readFile(join(directory, file), 'utf8');
			assert.equal(generatedSections(page, title).length, 0, `${file} repeats its title`);
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('no generated page carries an inline table of contents line', async () => {
	const root = await fixture();
	try {
		const result = generate(root);
		assert.equal(result.status, 0, resultText(result));
		const directory = join(root, 'docs', 'src', 'content', 'docs', 'specification');
		for (const file of ['structure.md', 'graph.md', 'gating.md', 'running.md', 'record.md']) {
			const page = await readFile(join(directory, file), 'utf8');
			assert.ok(!page.includes('On this page'), `${file} carries an inline contents line`);
		}
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('the operational record section is summarized and the source is untouched', async () => {
	const root = await fixture();
	const heading = 'Operational record conformance';
	try {
		const result = generate(root);
		assert.equal(result.status, 0, resultText(result));
		const page = await readFile(
			join(root, 'docs', 'src', 'content', 'docs', 'specification', 'conformance.md'),
			'utf8',
		);
		const [section] = generatedSections(page, heading);
		assert.ok(section, 'the summarized section is missing');
		assert.ok(section.trim().split(/\s+/u).length < 80, 'the summarized section is still long');
		assert.match(section, /specification\/conformance\.md/);

		const source = await readFile(join(root, 'specification', 'conformance.md'), 'utf8');
		assert.ok(source.includes('Capability tests prove'), 'the source lost its test notes');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('the generator refuses when a summarized section is renamed', async () => {
	const root = await fixture();
	const source = join(root, 'specification', 'conformance.md');
	try {
		const original = await readFile(source, 'utf8');
		await writeFile(source, original.replace('## Operational record conformance', '## Record conformance'));
		const result = generate(root);
		assert.notEqual(result.status, 0, resultText(result));
		assert.match(resultText(result), /Operational record conformance/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
