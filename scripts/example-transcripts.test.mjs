// Every shipped example's README pastes what `bot assembly check` prints for
// it. A paste nobody runs is prose, and this repository has already shipped a
// README that drifted from the runtime without anything going red. This test
// runs the command and compares stdout bytes and exit status to the paste.
//
// The command calls no model, reads no operator home, and needs no credential.
// The home it is given is a temporary one naming the same intelligence
// `sdlc/scripts/examples` writes, so one configuration serves both.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const examples = join(repository, 'examples');
const cli = join(repository, 'bot/src/cli.ts');

// `data/` holds the sample requests and `runs/` holds published runs. They sit
// beside the assemblies so a visitor's command is short, and neither is one.
const NOT_ASSEMBLIES = new Set(['data', 'runs']);

// The prompt line is prose. It shows the reader the installed launcher, which
// is not the binary a check run out of the working tree can invoke.
const PROMPT = '$ bot ';
const STATUS_PROMPT = '$ echo $?';

// Authored pages that paste the same command. A page and a README showing one
// command under one home must show one answer, so both are pinned the same way.
const SITE_PASTES = [{ page: 'docs/src/content/docs/start/run-the-example.md', target: './triage/triage' }];

const CONFIG = `intelligences:
  default:
    provider: google
    model: gemini-3.5-flash-lite
    reasoning: low
`;

/** Every `<assembly>/<flow>` target the examples ship, in path order. */
async function targets() {
	const found = [];
	for (const entry of await readdir(examples, { withFileTypes: true })) {
		if (!entry.isDirectory() || NOT_ASSEMBLIES.has(entry.name)) continue;
		const assembly = join(examples, entry.name);
		const manifest = await readFile(join(assembly, 'ASSEMBLY.md'), 'utf8').catch(() => undefined);
		assert.notEqual(manifest, undefined, `examples/${entry.name} has no ASSEMBLY.md`);
		for (const flow of await readdir(join(assembly, 'flows'), { withFileTypes: true })) {
			if (!flow.isDirectory()) continue;
			const definition = await readFile(join(assembly, 'flows', flow.name, 'FLOW.md'), 'utf8').catch(() => undefined);
			if (definition === undefined) continue;
			found.push({ assembly: entry.name, flow: flow.name, target: `./${entry.name}/${flow.name}` });
		}
	}
	return found.sort((left, right) => (left.target < right.target ? -1 : 1));
}

/** The console fence in an example README that pastes one check. */
function paste(readme, target) {
	const command = `bot assembly check ${target}`;
	const blocks = [...readme.matchAll(/```console\n([\s\S]*?)```/gu)].map((match) => match[1] ?? '');
	const block = blocks.find((body) => body.startsWith(`${PROMPT}assembly check ${target}\n`));
	assert.notEqual(block, undefined, `no console fence pastes "${command}"`);
	const lines = block.replace(/\n$/u, '').split('\n');
	const end = lines.indexOf(STATUS_PROMPT);
	assert.ok(end > 0, `the fence for "${command}" never asks for the exit status`);
	assert.equal(lines.length, end + 2, `the fence for "${command}" prints after its exit status`);
	const status = Number(lines[end + 1]);
	assert.ok(Number.isInteger(status), `the fence for "${command}" pastes no exit status`);
	return { stdout: `${lines.slice(1, end).join('\n')}\n`, status };
}

/** One private home holding the intelligence the examples name. */
async function privateHome() {
	const root = await mkdtemp(join(tmpdir(), 'bot-example-transcripts-'));
	const agent = join(root, 'pi-agent');
	await mkdir(agent, { mode: 0o700 });
	await writeFile(join(root, 'config.yaml'), CONFIG);
	return { root, agent };
}

function check(home, target) {
	try {
		const stdout = execFileSync('node', [cli, 'assembly', 'check', target, '--home', home.root], {
			cwd: examples,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			env: { PATH: process.env.PATH, HOME: home.root, PI_CODING_AGENT_DIR: home.agent },
		});
		return { stdout, status: 0 };
	} catch (failure) {
		return { stdout: failure.stdout ?? '', status: failure.status ?? -1 };
	}
}

test('every shipped example README pastes what bot assembly check prints', async () => {
	const found = await targets();
	assert.ok(found.length >= 4, `examples/ offered ${found.length} flows`);
	const home = await privateHome();
	try {
		for (const { assembly, target } of found) {
			const readme = await readFile(join(examples, assembly, 'README.md'), 'utf8');
			const expected = paste(readme, target);
			const actual = check(home, target);
			assert.equal(actual.stdout, expected.stdout, `examples/${assembly}/README.md pastes stale output for ${target}`);
			assert.equal(actual.status, expected.status, `examples/${assembly}/README.md pastes the wrong exit status for ${target}`);
		}
	} finally {
		await rm(home.root, { recursive: true, force: true });
	}
});

test('every site page that pastes a check prints what bot assembly check prints', async () => {
	const home = await privateHome();
	try {
		for (const { page, target } of SITE_PASTES) {
			const source = await readFile(join(repository, page), 'utf8');
			const expected = paste(source, target);
			const actual = check(home, target);
			assert.equal(actual.stdout, expected.stdout, `${page} pastes stale output for ${target}`);
			assert.equal(actual.status, expected.status, `${page} pastes the wrong exit status for ${target}`);
		}
	} finally {
		await rm(home.root, { recursive: true, force: true });
	}
});
