#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_INPUT = 65_536;
const MAX_DIAGNOSTIC = 2_048;
const relativeConfig = 'sdlc/ratchet.json';
const decisionRoots = [
	'sdlc/planning/bot-contraction/tickets',
	'sdlc/planning/bot-contraction/records',
	'sdlc/tickets',
	'sdlc/tickets/drafts',
	'sdlc/records',
];
const requiredText = [
	'Simpler approach tried',
	'Why insufficient alternatives were rejected',
	'Production code deleted',
	'Accepted cost',
];
const allFacts = ['Starting production size', 'Ending production size', ...requiredText];

function fail(message) {
	const prefix = 'size-decision: ';
	const room = MAX_DIAGNOSTIC - Buffer.byteLength(prefix) - 1;
	let body = message;
	while (Buffer.byteLength(body) > room) body = body.slice(0, -1);
	process.stderr.write(`${prefix}${body}\n`);
	process.exitCode = 1;
}

function git(root, args) {
	return spawnSync('git', args, { cwd: root, encoding: 'buffer', maxBuffer: MAX_INPUT });
}

function output(result) {
	return result.status === 0 ? result.stdout.toString('utf8') : undefined;
}

function maxFrom(text) {
	try {
		const value = JSON.parse(text).max;
		return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
	} catch {
		return undefined;
	}
}

async function fileText(path) {
	const facts = await stat(path);
	if (!facts.isFile() || facts.size > MAX_INPUT) return undefined;
	return readFile(path, 'utf8');
}

function paths(bytes) {
	return bytes.toString('utf8').split('\0').filter(Boolean);
}

function applicable(path) {
	return decisionRoots.some((root) => {
		const prefix = `${root}/`;
		const name = path.startsWith(prefix) ? path.slice(prefix.length) : '';
		return /^[0-9]{4}-[a-z0-9][a-z0-9-]*\.md$/u.test(name);
	});
}

function workingCandidates(root) {
	const changed = git(root, ['diff', '--name-only', '--diff-filter=ACMR', '-z', 'HEAD', '--', ...decisionRoots]);
	const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', ...decisionRoots]);
	if (changed.status !== 0 || untracked.status !== 0) return undefined;
	return [...new Set([...paths(changed.stdout), ...paths(untracked.stdout)].filter(applicable))];
}

function committedCandidates(root, parent) {
	const changed = git(root, [
		'diff-tree', '--no-commit-id', '--name-only', '-r', '-M', '--diff-filter=ACMR', '-z', parent, 'HEAD',
		'--', ...decisionRoots,
	]);
	return changed.status === 0 ? [...new Set(paths(changed.stdout).filter(applicable))] : undefined;
}

function decisionFacts(text) {
	const lines = text.split(/\r?\n/u);
	const start = lines.findIndex((line) => line === '## Size decision');
	if (start === -1) return new Map();
	const values = new Map();
	for (const line of lines.slice(start + 1)) {
		if (line.startsWith('## ')) break;
		const matched = /^- ([^:]+):\s*(.*)$/u.exec(line);
		if (matched !== null && allFacts.includes(matched[1]) && !values.has(matched[1])) {
			values.set(matched[1], matched[2]);
		}
	}
	return values;
}

function measured(value) {
	const matched = /^(\d+) nonblank lines$/u.exec(value ?? '');
	if (matched === null) return undefined;
	const number = Number(matched[1]);
	return Number.isSafeInteger(number) ? number : undefined;
}

async function judge(root, before, after, candidates, revision) {
	if (candidates === undefined) return fail('the Git decision comparison could not be read.');
	if (candidates.length !== 1) {
		return fail(`source ceiling rose from ${before} to ${after}; exactly one applicable size decision is required. Missing facts: ${allFacts.join(', ')}.`);
	}
	let text = revision === undefined ? undefined : output(git(root, ['show', `${revision}:${candidates[0]}`]));
	if (revision === undefined) {
		try {
			text = await fileText(join(root, candidates[0]));
		} catch {
			return fail('the applicable size decision could not be read.');
		}
	}
	if (text === undefined) return fail('the applicable size decision could not be read.');
	const facts = decisionFacts(text);
	const wrong = allFacts.filter((name) => {
		if (name === 'Starting production size') return measured(facts.get(name)) !== before;
		if (name === 'Ending production size') return measured(facts.get(name)) !== after;
		return (facts.get(name) ?? '').trim().length === 0;
	});
	if (wrong.length > 0) return fail(`missing or mismatched size-decision facts: ${wrong.join(', ')}.`);
	process.stdout.write(`size-decision: accepted ${before}/${after} from ${candidates[0]}.\n`);
}

async function main() {
	const root = resolve(process.argv[2] ?? dirname(dirname(fileURLToPath(import.meta.url))));
	const top = output(git(root, ['rev-parse', '--show-toplevel']));
	if (top === undefined || resolve(top.trim()) !== root) return fail('the Git comparison is unavailable.');
	let currentText;
	try {
		currentText = await fileText(join(root, relativeConfig));
	} catch {
		return fail('the current source ceiling could not be read.');
	}
	const current = currentText === undefined ? undefined : maxFrom(currentText);
	if (current === undefined) return fail('the current source ceiling is invalid.');

	const headText = output(git(root, ['show', `HEAD:${relativeConfig}`]));
	const head = headText === undefined ? undefined : maxFrom(headText);
	if (head === undefined) return fail('the checked-in source-ceiling comparison could not be read.');
	if (current !== head) {
		if (current < head) return process.stdout.write(`size-decision: lowered ${head}/${current}.\n`);
		return judge(root, head, current, workingCandidates(root));
	}

	const ancestry = output(git(root, ['rev-list', '--parents', '-n', '1', 'HEAD']));
	if (ancestry === undefined) return fail('the Git ancestry comparison could not be read.');
	const parent = ancestry.trim().split(/\s+/u)[1];
	if (parent === undefined) return process.stdout.write('size-decision: initial baseline.\n');
	const parentText = output(git(root, ['show', `${parent}:${relativeConfig}`]));
	const previous = parentText === undefined ? undefined : maxFrom(parentText);
	if (previous === undefined) return fail('the parent source-ceiling comparison could not be read.');
	if (head <= previous) return process.stdout.write(`size-decision: unchanged ${head}.\n`);
	return judge(root, previous, head, committedCandidates(root, parent), 'HEAD');
}

await main();
