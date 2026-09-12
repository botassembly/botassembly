#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const scriptPath = fileURLToPath(import.meta.url);
const utf8 = new TextDecoder('utf-8', { fatal: true });

function decodePath(bytes) {
	try {
		return utf8.decode(bytes);
	} catch {
		throw new Error('git ls-files returned invalid UTF-8 path bytes');
	}
}

// Git emits one tracked path per NUL with -z. Reading those bytes directly
// keeps a newline in a filename from changing the path list.
export function parseTrackedPaths(bytes) {
	const paths = [];
	let start = 0;
	for (let index = 0; index < bytes.length; index += 1) {
		if (bytes[index] !== 0) continue;
		if (index > start) paths.push(decodePath(bytes.subarray(start, index)));
		start = index + 1;
	}
	if (start < bytes.length) paths.push(decodePath(bytes.subarray(start)));
	return paths;
}

export function findCaseCollisions(paths) {
	const groups = new Map();
	for (const path of [...new Set(paths)].sort()) {
		const key = path.toLowerCase();
		const group = groups.get(key) ?? [];
		group.push(path);
		groups.set(key, group);
	}
	return [...groups.entries()]
		.filter(([, group]) => group.length > 1)
		.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
		.map(([, group]) => group);
}

function quote(path) {
	return JSON.stringify(path);
}

function gitTrackedPaths(root) {
	const result = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'buffer' });
	if (result.error !== undefined) {
		throw new Error(`git ls-files failed: ${quote(result.error.message)}`);
	}
	if (result.status !== 0) {
		const detail = result.stderr.length === 0 ? '' : `: ${quote(result.stderr.toString('utf8').trim())}`;
		throw new Error(`git ls-files exited with status ${String(result.status)}${detail}`);
	}
	return parseTrackedPaths(result.stdout);
}

function run(root) {
	const collisions = findCaseCollisions(gitTrackedPaths(root));
	for (const group of collisions) {
		process.stderr.write(`case-collision: ${group.map(quote).join(' and ')}\n`);
	}
	return collisions.length === 0 ? 0 : 1;
}

function main() {
	try {
		process.exitCode = run(process.argv[2] ?? process.cwd());
	} catch (error) {
		process.stderr.write(`case-collision: ${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	}
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === scriptPath) main();
