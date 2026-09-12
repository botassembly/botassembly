import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, constants, lstatSync, openSync, readFileSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';

const EXACT_PROSE_PATHS = new Set([
	'readme.md',
	'security.md',
	'contributing.md',
	'specification/readme.md',
	'specification/changelog.md',
	'specification/conformance.md',
	'specification/example.md',
	'smoke/readme.md',
	'smoke/falsifications.md',
	'sdlc/readme.md',
	'sdlc/scripts/readme.md',
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
const REVIEWED_SYNTHETIC_FIXTURES = new Map([
	['specification/conformance/records/v1/record.jsonl', 'd88f45e4bf1d29f4acec9a87002c7b33b7ecfee5ae3eb983ea888934ae3c179a'],
	['docs/src/data/synthetic-walkthrough-record.json', '0dafdd4335810288cc81c8012e05a8c952fce3977fe8d13f6a9a8ec5a9fd064c'],
]);
const BOT_EVENTS = new Set([
	'run_start', 'run_end', 'stage_carried', 'stage_start', 'prompt', 'stage_end', 'unreconciled',
	'tmp_teardown', 'provider_start', 'turn', 'provider_retry', 'provider_transport', 'gate_start',
	'check', 'tool_call', 'tool_denied', 'subflow_call', 'chose', 'loop_done', 'parallel_done',
	'fanout_start', 'fanout_done', 'hook', 'hash_drift', 'signal',
]);

class NonTextError extends Error {}

function trackedPaths(repository) {
	const bytes = execFileSync('git', ['ls-files', '-z'], { cwd: repository });
	return bytes.toString('utf8').split('\0').filter(Boolean);
}

function prosePath(path) {
	const normalized = path.toLowerCase();
	if (EXCLUDED_PROSE_PATHS.has(normalized) || EXCLUDED_PROSE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return false;
	if (EXACT_PROSE_PATHS.has(normalized)) return true;
	if (normalized.startsWith(DOCUMENTATION_PREFIX)) return normalized.endsWith('.md') || normalized.endsWith('.mdx');
	return normalized.endsWith('.md') && MARKDOWN_PROSE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function forbiddenProse(path, content) {
	const inspected = path === 'SECURITY.md' ? content.replaceAll(SECURITY_CONTACT, '') : content;
	return PRIVATE_PATHS.some((privatePath) => inspected.includes(privatePath))
		|| DISTINCTIVE_PROSE.test(inspected)
		|| AMBIGUOUS_PROSE.test(inspected);
}

function mustBeTextPath(path) {
	const normalized = path.toLowerCase();
	if (REVIEWED_SYNTHETIC_FIXTURES.has(path)) return true;
	if (prosePath(path)) return true;
	return normalized.startsWith('docs/src/content/docs/')
		|| normalized.startsWith('docs/src/data/')
		|| normalized.startsWith('examples/');
}

function parsedJsonValues(text) {
	const values = [];
	for (let start = 0; start < text.length; start += 1) {
		if (text[start] !== '{' && text[start] !== '[') continue;
		const opening = text[start];
		const closing = opening === '{' ? '}' : ']';
		let depth = 0;
		let quoted = false;
		let escaped = false;
		for (let end = start; end < text.length; end += 1) {
			const character = text[end];
			if (quoted) {
				if (escaped) escaped = false;
				else if (character === '\\') escaped = true;
				else if (character === '"') quoted = false;
				continue;
			}
			if (character === '"') quoted = true;
			else if (character === opening) depth += 1;
			else if (character === closing) {
				depth -= 1;
				if (depth !== 0) continue;
				try {
					values.push(JSON.parse(text.slice(start, end + 1)));
					start = end;
				} catch {
					// A surrounding non-JSON brace can contain a later valid JSON value.
				}
				break;
			}
		}
	}
	return values;
}

function nestedObjects(values) {
	const objects = [];
	const visit = (value) => {
		if (value === null || typeof value !== 'object') return;
		if (!Array.isArray(value)) objects.push(value);
		for (const child of Object.values(value)) visit(child);
	};
	for (const value of values) visit(value);
	return objects;
}

function retainedStructure(content) {
	const objects = nestedObjects(parsedJsonValues(content));
	const events = objects.filter((value) => typeof value.event === 'string' && BOT_EVENTS.has(value.event));
	if (events.length > 1 && events.some((value) => value.event === 'run_start' || value.event === 'stage_start')) {
		return 'Bot record';
	}
	if (objects.some((value) =>
		value.type === 'message'
		&& value.message !== null
		&& typeof value.message === 'object'
		&& typeof value.message.role === 'string'
		&& Object.hasOwn(value.message, 'content'))) {
		return 'Pi session';
	}
	return undefined;
}

function digest(content) {
	return createHash('sha256').update(content, 'utf8').digest('hex');
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
		const normalized = path.toLowerCase();
		const normalizedBase = base.toLowerCase();
		if (normalized.startsWith('sdlc/planning/dogfood/')) violations.push(`tracked dogfood path "${path}"`);
		const rawExampleRun = normalized.startsWith('examples/runs/');
		if (rawExampleRun) violations.push(`tracked raw example run "${path}"`);
		if (/(?:^|\/)runs\/[^/]+\//u.test(normalized) && !rawExampleRun) {
			violations.push(`tracked retained run path "${path}"`);
		}
		if (!rawExampleRun && (normalizedBase === 'record.jsonl' || normalizedBase === 'session.jsonl') && !REVIEWED_SYNTHETIC_FIXTURES.has(path)) {
			violations.push(`forbidden retained-data basename "${path}"`);
		}
		if (normalizedBase === '.env' || normalizedBase.startsWith('.env.') || normalizedBase === 'credentials.json' || normalizedBase === 'auth.json') {
			violations.push(`forbidden credential basename "${path}"`);
		}
		try {
			const content = read(path);
			const reviewedDigest = REVIEWED_SYNTHETIC_FIXTURES.get(path);
			if (reviewedDigest !== undefined) {
				if (digest(content) !== reviewedDigest) {
					violations.push(`reviewed synthetic fixture digest changed "${path}"`);
				}
				continue;
			}
			if (prosePath(path) && forbiddenProse(path, content)) violations.push(`forbidden public prose "${path}"`);
			const structure = retainedStructure(content);
			if (structure !== undefined) violations.push(`retained ${structure} structure "${path}"`);
		} catch (error) {
			if (error instanceof NonTextError) {
				if (mustBeTextPath(path)) violations.push(`non-text public prose "${path}"`);
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
