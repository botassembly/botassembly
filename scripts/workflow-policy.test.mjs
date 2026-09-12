import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const workflowDirectory = join(repository, '.github', 'workflows');
const require = createRequire(join(repository, 'bot', 'package.json'));
const { parse } = require('yaml');

const EXPECTED_FILES = ['docs.yml', 'runtime.yml'];
const EXPECTED_USES = [
	{ workflow: 'docs.yml', path: 'jobs.build.steps[0].uses', value: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1' },
	{ workflow: 'docs.yml', path: 'jobs.build.steps[1].uses', value: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020' },
	{ workflow: 'docs.yml', path: 'jobs.build.steps[4].uses', value: 'actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9' },
	{ workflow: 'docs.yml', path: 'jobs.deploy.steps[0].uses', value: 'actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346' },
	{ workflow: 'runtime.yml', path: 'jobs.check.steps[0].uses', value: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1' },
	{ workflow: 'runtime.yml', path: 'jobs.check.steps[1].uses', value: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020' },
];
const EXPECTED_PERMISSIONS = [
	{ workflow: 'docs.yml', path: 'permissions', value: { contents: 'read' } },
	{ workflow: 'docs.yml', path: 'jobs.deploy.permissions', value: { pages: 'write', 'id-token': 'write' } },
	{ workflow: 'runtime.yml', path: 'permissions', value: { contents: 'read' } },
];
const DEPLOY_GATE = "${{ vars.PUBLISH_PAGES == 'true' }}";
const REQUIRED_ABSENCES = [
	['docs.yml', 'jobs.build'],
	['runtime.yml', 'jobs.check'],
];

async function currentWorkflows() {
	const entries = (await readdir(workflowDirectory, { withFileTypes: true }))
		.sort((left, right) => left.name.localeCompare(right.name));
	return Promise.all(entries.map(async (entry) => ({
		name: entry.name,
		regular: entry.isFile(),
		document: entry.isFile() ? parse(await readFile(join(workflowDirectory, entry.name), 'utf8')) : undefined,
	})));
}

function pathName(parts) {
	return parts.reduce((result, part) => typeof part === 'number'
		? `${result}[${part}]`
		: result ? `${result}.${part}` : part, '');
}

function collect(document, workflow, parts = [], inventory = { uses: [], permissions: [] }) {
	if (Array.isArray(document)) {
		for (const [index, value] of document.entries()) collect(value, workflow, [...parts, index], inventory);
		return inventory;
	}
	if (document === null || typeof document !== 'object') return inventory;
	for (const [key, value] of Object.entries(document)) {
		const path = [...parts, key];
		if (key === 'uses') inventory.uses.push({ workflow, path: pathName(path), value });
		if (key === 'permissions') inventory.permissions.push({
			workflow,
			path: pathName(path),
			value,
		});
		collect(value, workflow, path, inventory);
	}
	return inventory;
}

function inventory(workflows) {
	return workflows.reduce((all, workflow) => {
		const found = collect(workflow.document, workflow.name);
		all.uses.push(...found.uses);
		all.permissions.push(...found.permissions);
		return all;
	}, { uses: [], permissions: [] });
}

function at(workflows, name, path) {
	const workflow = workflows.find((candidate) => candidate.name === name);
	return path.split('.').reduce((value, part) => value?.[part], workflow?.document);
}

function root(workflows, name) {
	return workflows.find((workflow) => workflow.name === name)?.document;
}

function validate(workflows) {
	assert.deepEqual(workflows.map(({ name }) => name), EXPECTED_FILES);
	assert.ok(workflows.every(({ regular }) => regular), 'every workflow entry must be a regular file');
	assert.ok(workflows.every(({ document }) => document && typeof document === 'object'), 'every workflow must parse as a document');

	const found = inventory(workflows);
	assert.deepEqual(found.uses, EXPECTED_USES);
	assert.deepEqual(found.permissions, EXPECTED_PERMISSIONS);
	for (const [workflow, path] of REQUIRED_ABSENCES) {
		assert.equal(Object.hasOwn(at(workflows, workflow, path), 'permissions'), false,
			`${workflow} ${path} must not declare permissions`);
	}
	assert.equal(at(workflows, 'docs.yml', 'jobs.deploy').if, DEPLOY_GATE);
	assert.equal(Object.hasOwn(at(workflows, 'docs.yml', 'jobs.build'), 'if'), false,
		'docs.yml jobs.build must remain unconditional');
}

test('the workflow policy inventories every maintained workflow', async () => {
	const workflows = await currentWorkflows();
	validate(workflows);
	const found = inventory(workflows);
	assert.equal(workflows.length, 2);
	assert.equal(found.uses.length, 6);
	assert.equal(found.permissions.filter(({ path }) => path === 'permissions').length, 2);
	assert.equal(found.permissions.filter(({ path }) => path.endsWith('.permissions')).length, 1);
	assert.equal(REQUIRED_ABSENCES.filter(([workflow, path]) => !Object.hasOwn(at(workflows, workflow, path), 'permissions')).length, 2);
});

function clone(workflows) {
	return workflows.map(({ name, regular, document }) => ({ name, regular, document: structuredClone(document) }));
}

function step(workflows, workflow, job, index) {
	return at(workflows, workflow, `jobs.${job}.steps`)[index];
}

test('the workflow policy rejects every named hostile mutation', async () => {
	const original = await currentWorkflows();
	const mutations = [
		['an added workflow', (workflows) => workflows.push({ name: 'extra.yml', regular: true, document: {} })],
		['a removed workflow', (workflows) => workflows.pop()],
		['a deleted direct action', (workflows) => { delete step(workflows, 'docs.yml', 'build', 0).uses; }],
		['a local action path', (workflows) => { step(workflows, 'docs.yml', 'build', 0).uses = './.github/actions/build'; }],
		['a Docker action reference', (workflows) => { step(workflows, 'docs.yml', 'build', 0).uses = 'docker://example/build:latest'; }],
		['a different full action SHA', (workflows) => { step(workflows, 'docs.yml', 'build', 0).uses = 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262'; }],
		['an added step action', (workflows) => { at(workflows, 'docs.yml', 'jobs.build.steps').push({ uses: 'example/action@v1' }); }],
		['a job-level reusable workflow', (workflows) => { at(workflows, 'docs.yml', 'jobs.build').uses = './.github/workflows/reusable.yml'; }],
		['deleted docs workflow permissions', (workflows) => { delete root(workflows, 'docs.yml').permissions; }],
		['added docs workflow permission', (workflows) => { root(workflows, 'docs.yml').permissions.actions = 'read'; }],
		['changed docs workflow permission', (workflows) => { root(workflows, 'docs.yml').permissions.contents = 'write'; }],
		['deleted runtime workflow permissions', (workflows) => { delete root(workflows, 'runtime.yml').permissions; }],
		['added runtime workflow permission', (workflows) => { root(workflows, 'runtime.yml').permissions.actions = 'read'; }],
		['changed runtime workflow permission', (workflows) => { root(workflows, 'runtime.yml').permissions.contents = 'write'; }],
		['added docs build permissions', (workflows) => { at(workflows, 'docs.yml', 'jobs.build').permissions = { contents: 'read' }; }],
		['added runtime check permissions', (workflows) => { at(workflows, 'runtime.yml', 'jobs.check').permissions = { contents: 'read' }; }],
		['deleted deploy pages permission', (workflows) => { delete at(workflows, 'docs.yml', 'jobs.deploy').permissions.pages; }],
		['added weak deploy pages permission', (workflows) => { const permissions = at(workflows, 'docs.yml', 'jobs.deploy').permissions; delete permissions.pages; permissions.pages = 'read'; }],
		['changed deploy pages permission', (workflows) => { at(workflows, 'docs.yml', 'jobs.deploy').permissions.pages = 'read'; }],
		['deleted deploy identity permission', (workflows) => { delete at(workflows, 'docs.yml', 'jobs.deploy').permissions['id-token']; }],
		['added weak deploy identity permission', (workflows) => { const permissions = at(workflows, 'docs.yml', 'jobs.deploy').permissions; delete permissions['id-token']; permissions['id-token'] = 'read'; }],
		['changed deploy identity permission', (workflows) => { at(workflows, 'docs.yml', 'jobs.deploy').permissions['id-token'] = 'read'; }],
		['deleted deploy gate', (workflows) => { delete at(workflows, 'docs.yml', 'jobs.deploy').if; }],
		['false deploy gate', (workflows) => { at(workflows, 'docs.yml', 'jobs.deploy').if = '${{ false }}'; }],
		['changed deploy gate shape', (workflows) => { at(workflows, 'docs.yml', 'jobs.deploy').if = '${{ vars.PUBLISH_PAGES }}'; }],
		['gated docs build', (workflows) => { at(workflows, 'docs.yml', 'jobs.build').if = DEPLOY_GATE; }],
	];
	for (const [name, mutate] of mutations) {
		const changed = clone(original);
		mutate(changed);
		assert.throws(() => validate(changed), undefined, name);
	}
});
