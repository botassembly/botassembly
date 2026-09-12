import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(join(repository, 'bot', 'package.json'));
const { parse } = require('yaml');
const workflow = join(repository, '.github', 'workflows', 'docs.yml');
const CHECKOUT = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1';
const SETUP_NODE = 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020';
const UPLOAD_PAGES = 'actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9';
const DEPLOY_PAGES = 'actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346';
const DEPLOY_GATE = "${{ vars.PUBLISH_PAGES == 'true' }}";
const ACTION_LINES = [
	`      - uses: ${CHECKOUT} # v7.0.1`,
	`      - uses: ${SETUP_NODE} # v7.0.0`,
	`      - uses: ${UPLOAD_PAGES} # v5.0.0`,
	`        uses: ${DEPLOY_PAGES} # v5.0.1`,
];

function action(steps, identity) {
	return steps.find((step) => typeof step.uses === 'string' && step.uses.startsWith(`${identity}@`));
}

function validate(document) {
	assert.deepEqual(Object.keys(document), ['name', 'on', 'permissions', 'concurrency', 'jobs']);
	assert.equal(document.name, 'docs');
	assert.deepEqual(document.on, {
		push: {
			branches: ['main'],
			paths: ['docs/**', 'specification/**', '.github/workflows/docs.yml'],
		},
		workflow_dispatch: null,
	});
	assert.deepEqual(document.permissions, { contents: 'read' });
	assert.deepEqual(document.concurrency, { group: 'pages', 'cancel-in-progress': true });
	assert.deepEqual(Object.keys(document.jobs ?? {}), ['build', 'deploy']);

	const build = document.jobs.build;
	assert.deepEqual(Object.keys(build ?? {}), ['runs-on', 'steps']);
	assert.equal(build['runs-on'], 'ubuntu-latest');
	assert.deepEqual(build.steps ?? [], [
		{ uses: CHECKOUT, with: { 'persist-credentials': false } },
		{ uses: SETUP_NODE, with: {
			'node-version': 22, cache: 'npm', 'cache-dependency-path': 'docs/package-lock.json',
		} },
		{ run: 'npm ci', 'working-directory': 'docs' },
		{ run: 'npm run build', 'working-directory': 'docs' },
		{ uses: UPLOAD_PAGES, with: { path: 'docs/dist' } },
	]);

	const deploy = document.jobs.deploy;
	assert.deepEqual(Object.keys(deploy ?? {}), ['needs', 'if', 'runs-on', 'permissions', 'environment', 'steps']);
	assert.equal(deploy.needs, 'build');
	assert.equal(deploy.if, DEPLOY_GATE);
	assert.equal(deploy['runs-on'], 'ubuntu-latest');
	assert.deepEqual(deploy.permissions, { pages: 'write', 'id-token': 'write' });
	assert.deepEqual(deploy.environment, {
		name: 'github-pages',
		url: '${{ steps.deployment.outputs.page_url }}',
	});
	assert.deepEqual(deploy.steps ?? [], [
		{ id: 'deployment', uses: DEPLOY_PAGES },
	]);
}

function validateSource(source) {
	const lines = source.split('\n');
	for (const line of ACTION_LINES) assert.ok(lines.includes(line), `missing exact action line: ${line}`);
}

async function currentSource() {
	return readFile(workflow, 'utf8');
}

function replaceLine(source, currentLine, replacementLine) {
	assert.ok(source.includes(currentLine), `missing mutation target: ${currentLine}`);
	return source.replace(currentLine, replacementLine);
}

test('the documentation workflow grants deployment authority only to deploy', async () => {
	const source = await currentSource();
	validate(parse(source));
	validateSource(source);
});

test('the documentation workflow contract rejects mutable and unrelated action refs', async () => {
	const original = parse(await currentSource());
	const mutations = [
		(document) => { action(document.jobs.build.steps, 'actions/checkout').uses = 'actions/checkout@v4'; },
		(document) => { action(document.jobs.build.steps, 'actions/setup-node').uses = 'actions/setup-node@v4'; },
		(document) => { action(document.jobs.build.steps, 'actions/upload-pages-artifact').uses = 'actions/upload-pages-artifact@v3'; },
		(document) => { action(document.jobs.deploy.steps, 'actions/deploy-pages').uses = 'actions/deploy-pages@v4'; },
		(document) => { action(document.jobs.build.steps, 'actions/checkout').uses = 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262'; },
	];
	for (const mutate of mutations) {
		const changed = structuredClone(original);
		mutate(changed);
		assert.throws(() => validate(changed));
	}
});

test('the documentation workflow source requires each exact release comment', async () => {
	const original = await currentSource();
	const missingComment = replaceLine(original, ACTION_LINES[0], `      - uses: ${CHECKOUT}`);
	const changedComment = replaceLine(original, ACTION_LINES[3], `        uses: ${DEPLOY_PAGES} # v5.0.0`);
	assert.throws(() => validateSource(missingComment));
	assert.throws(() => validateSource(changedComment));
});

test('the documentation workflow contract rejects weakened authority and changed work', async () => {
	const original = parse(await currentSource());
	const mutations = [
		(document) => { document.permissions.contents = 'write'; },
		(document) => { document.permissions.pages = 'write'; },
		(document) => { document.jobs.build.permissions = { contents: 'read' }; },
		(document) => { document.jobs.deploy.permissions.pages = 'read'; },
		(document) => { document.jobs.deploy.permissions['id-token'] = 'read'; },
		(document) => { document.jobs.deploy.permissions.contents = 'read'; },
		(document) => { delete action(document.jobs.build.steps, 'actions/checkout').with['persist-credentials']; },
		(document) => { action(document.jobs.build.steps, 'actions/checkout').with['persist-credentials'] = true; },
		(document) => { document.jobs.preview = structuredClone(document.jobs.build); },
		(document) => { document.jobs.build.if = 'false'; },
		(document) => { document.jobs.build.steps[0].if = 'false'; },
		(document) => { document.jobs.build.steps.reverse(); },
		(document) => { document.jobs.build.steps.push({ run: 'true' }); },
		(document) => { document.jobs.deploy.steps.push({ run: 'true' }); },
		(document) => { document.jobs.build.steps[0].uses = 'example/checkout@v4'; },
		(document) => { document.jobs.build.steps[1].uses = 'example/setup-node@v4'; },
		(document) => { document.jobs.build.steps[2].run = 'npm install'; },
		(document) => { document.jobs.deploy.needs = []; },
		(document) => { document.jobs.deploy.environment.url = 'https://example.test'; },
		(document) => { document.jobs.deploy.steps[0].uses = 'example/deploy-pages@v4'; },
	];
	for (const mutate of mutations) {
		const changed = structuredClone(original);
		mutate(changed);
		assert.throws(() => validate(changed));
	}
});

test('the documentation workflow contract rejects absent, false, and changed deploy gates', async () => {
	const original = parse(await currentSource());
	const mutations = [
		(document) => { delete document.jobs.deploy.if; },
		(document) => { document.jobs.deploy.if = false; },
		(document) => { document.jobs.deploy.if = '${{ false }}'; },
		(document) => { document.jobs.deploy.if = '${{ vars.PUBLISH_PAGES }}'; },
		(document) => { document.jobs.deploy.if = "${{ vars.PUBLISH_PAGES != 'false' }}"; },
		(document) => { document.jobs.deploy.if = '${{ vars.PUBLISH_PAGES == true }}'; },
		(document) => {
			delete document.jobs.deploy.if;
			document.jobs.deploy.steps[0].if = DEPLOY_GATE;
		},
	];
	for (const mutate of mutations) {
		const changed = structuredClone(original);
		mutate(changed);
		assert.throws(() => validate(changed));
	}
});
