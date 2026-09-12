import { execFileSync } from 'node:child_process';
import { closeSync, constants, lstatSync, openSync, readFileSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';

const EXACT_PROSE_PATHS = new Set([
	'README.md',
	'SECURITY.md',
	'CONTRIBUTING.md',
	'specification/README.md',
	'specification/CHANGELOG.md',
	'specification/conformance.md',
	'specification/example.md',
	'smoke/README.md',
	'smoke/falsifications.md',
	'sdlc/README.md',
	'sdlc/scripts/README.md',
]);
const EXCLUDED_PROSE_PREFIXES = [
	'sdlc/records/',
	'sdlc/tickets/archive/',
	'sdlc/planning/archive/',
	'sdlc/planning/bot-contraction/records/',
];
const EXCLUDED_PROSE_PATHS = new Set([
	'sdlc/planning/bot-contraction/baseline.md',
]);
const MARKDOWN_PROSE_PREFIXES = [
	'specification/elements/',
	'sdlc/planning/',
	'sdlc/tickets/drafts/',
	'sdlc/issues/',
	'examples/',
];
const DOCUMENTATION_PREFIX = 'docs/src/content/docs/';
const WORD_EDGE = '[\\p{L}\\p{N}_]';
const DISTINCTIVE_TOKENS = [
	'trials\\s*\\d+',
	['genom', 'oncology'].join(''),
	['var', 'classify'].join(''),
	['bio', 'mcp'].join(''),
	['pico', 'hr'].join(''),
	['rolo', 'dex'].join(''),
	['factory', '2'].join(''),
	['imau', 'rer'].join(''),
];
const AMBIGUOUS_TOKENS = [
	['Fac', 'tory'].join(''),
	['De', 'ck'].join(''),
	['Nu', 'cleus'].join(''),
	['Lib', 'rarian'].join(''),
	['Bio', 'Data'].join(''),
];
const PRIVATE_PATHS = ['/home/' + 'ian/', '/Users/' + 'ian/'];
const SECURITY_CONTACT = ['imau', 'rer@gmail.com'].join('');
const DISTINCTIVE_PROSE = new RegExp(`(?<!${WORD_EDGE})(?:${DISTINCTIVE_TOKENS.join('|')})(?!${WORD_EDGE})`, 'iu');
const AMBIGUOUS_PROSE = new RegExp(`(?<!${WORD_EDGE})(?:${AMBIGUOUS_TOKENS.join('|')})(?!${WORD_EDGE})`, 'u');
const UTF8 = new TextDecoder('utf-8', { fatal: true });

class NonTextError extends Error {}

function trackedPaths(repository) {
	const bytes = execFileSync('git', ['ls-files', '-z'], { cwd: repository });
	return bytes.toString('utf8').split('\0').filter(Boolean);
}

function prosePath(path) {
	if (EXCLUDED_PROSE_PATHS.has(path) || EXCLUDED_PROSE_PREFIXES.some((prefix) => path.startsWith(prefix))) return false;
	if (EXACT_PROSE_PATHS.has(path)) return true;
	if (path.startsWith(DOCUMENTATION_PREFIX)) return path.endsWith('.md') || path.endsWith('.mdx');
	return path.endsWith('.md') && MARKDOWN_PROSE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function forbiddenProse(path, content) {
	const inspected = path === 'SECURITY.md' ? content.replaceAll(SECURITY_CONTACT, '') : content;
	return PRIVATE_PATHS.some((privatePath) => inspected.includes(privatePath))
		|| DISTINCTIVE_PROSE.test(inspected)
		|| AMBIGUOUS_PROSE.test(inspected);
}

function decodeText(bytes) {
	if (bytes.includes(0)) throw new NonTextError();
	try {
		return UTF8.decode(bytes);
	} catch {
		throw new NonTextError();
	}
}

function readStoredText(repository, path) {
	const absolute = join(repository, path);
	const metadata = lstatSync(absolute);
	if (metadata.isSymbolicLink()) return decodeText(readlinkSync(absolute, { encoding: 'buffer' }));
	if (!metadata.isFile()) throw new Error('tracked path is not a file or symbolic link');
	let descriptor;
	try {
		descriptor = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
		return decodeText(readFileSync(descriptor));
	} finally {
		if (descriptor !== undefined) closeSync(descriptor);
	}
}

export function publicTreeViolations(paths, read = () => '') {
	const violations = [];
	for (const path of paths) {
		const base = path.slice(path.lastIndexOf('/') + 1);
		if (path.startsWith('sdlc/planning/dogfood/')) violations.push(`tracked dogfood path "${path}"`);
		if (path.startsWith('examples/runs/')) violations.push(`tracked raw example run "${path}"`);
		if (base === '.env' || base.startsWith('.env.') || base === 'credentials.json' || base === 'auth.json') {
			violations.push(`forbidden credential basename "${path}"`);
		}
		if (!prosePath(path)) continue;
		try {
			if (forbiddenProse(path, read(path))) violations.push(`forbidden public prose "${path}"`);
		} catch (error) {
			if (error instanceof NonTextError) {
				violations.push(`non-text public prose "${path}"`);
			} else {
				const message = error instanceof Error ? error.message : String(error);
				violations.push(`unable to read public prose "${path}": ${message}`);
			}
		}
	}
	return violations;
}

export function checkPublicTree(repository = process.cwd()) {
	const paths = trackedPaths(repository);
	return publicTreeViolations(paths, (path) => readStoredText(repository, path));
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
	const repository = process.argv[2] ?? process.cwd();
	let violations;
	try {
		violations = checkPublicTree(repository);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`public-tree: unable to inspect ${repository}: ${message}\n`);
		process.exit(2);
	}
	if (violations.length > 0) {
		for (const violation of violations) process.stderr.write(`public-tree: ${violation}\n`);
		process.exit(1);
	}
}
