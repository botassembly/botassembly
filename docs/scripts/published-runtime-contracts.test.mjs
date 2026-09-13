import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const docs = dirname(dirname(fileURLToPath(import.meta.url)));
const repository = dirname(docs);

const retiredContinueCommand = /\bbot run --continue\b/giu;
const refusalWords = '(?:refused|rejected|removed|retired|no longer accepted|not accepted)';
const compatibilitySubject = /^(?:a|the)\s+(?:later|future)\s+pre-1\.0\s+runtime\b/iu;
const inheritedSubjectClause = /^(?:must|will|it|the runtime)\b/iu;
const crossSentenceSubjectClause = /^(?:it|the runtime)\b/iu;
const modal = /\b(?:must|will)\b/giu;
const acceptance = /\b(?:accept|support)\b/iu;
const compatibilityNouns = /(?:\b(?:older|stable|0\.1)\b[\s\S]*\bassembl(?:y|ies)\b|\bassembl(?:y|ies)\b[\s\S]*\b(?:older|stable|0\.1)\b)/iu;

function refusalGovernsOccurrence(line, start, end) {
	const before = line.slice(0, start);
	const after = line.slice(end);
	const inlineMark = String.fromCharCode(96);
	const beforePattern = new RegExp(`\\b${refusalWords}\\b\\s*:?\\s*${inlineMark}?$`, 'iu');
	const afterPattern = new RegExp(`^\\s*(?:[^${inlineMark}\\n]*${inlineMark}\\s*)?(?:is|was)\\s+${refusalWords}\\b`, 'iu');
	return beforePattern.test(before) || afterPattern.test(after);
}

function sentences(paragraph) {
	const result = [];
	let start = 0;
	for (let index = 0; index < paragraph.length; index += 1) {
		const character = paragraph[index];
		if (!'.!?'.includes(character)) continue;
		const previous = paragraph[index - 1] ?? '';
		const next = paragraph[index + 1] ?? '';
		if (character === '.' && /\d/u.test(previous) && /\d/u.test(next)) continue;
		if (next.length > 0 && !/\s/u.test(next)) continue;
		result.push(paragraph.slice(start, index).trim());
		start = index + 1;
	}
	if (paragraph.slice(start).trim().length > 0) result.push(paragraph.slice(start).trim());
	return result;
}

function clauses(paragraph) {
	return sentences(paragraph).flatMap((sentence, sentenceNumber) => sentence
		.split(';')
		.flatMap((part) => part.split(/,\s+but\s+/iu))
		.map((text) => ({ text: text.trim(), sentence: sentenceNumber }))
		.filter(({ text }) => text.length > 0));
}

function stripMarkdownPrefixes(text) {
	let result = text.trim();
	let previous;
	do {
		previous = result;
		result = result.replace(/^(?:>\s*|[-+*]\s+|\d+[.)]\s+|#{1,6}\s+)/u, '').trimStart();
	} while (result !== previous);
	return result;
}

function clausePromisesCompatibility(text) {
	const modalMatches = [...text.matchAll(modal)];
	for (const [index, match] of modalMatches.entries()) {
		const start = (match.index ?? 0) + match[0].length;
		const end = modalMatches[index + 1]?.index ?? text.length;
		const body = text.slice(start, end);
		const accepted = acceptance.exec(body);
		if (accepted === null || /\b(?:not|never|no longer)\b/iu.test(body.slice(0, accepted.index))) continue;
		if (compatibilityNouns.test(body.slice(accepted.index + accepted[0].length))) return true;
	}
	return false;
}

function promisesCompatibility(paragraph) {
	let carriesSubject = false;
	let previousSentence = 0;
	let subjectSentence = -1;
	for (const { text, sentence } of clauses(paragraph)) {
		const normalizedText = stripMarkdownPrefixes(text);
		const explicitSubject = compatibilitySubject.test(normalizedText);
		const inherited = carriesSubject && inheritedSubjectClause.test(normalizedText)
			&& (sentence === previousSentence || (sentence === previousSentence + 1 && sentence === subjectSentence + 1 && crossSentenceSubjectClause.test(normalizedText)));
		carriesSubject = explicitSubject || inherited;
		if (explicitSubject) subjectSentence = sentence;
		if (carriesSubject && clausePromisesCompatibility(normalizedText)) return true;
		previousSentence = sentence;
	}
	return false;
}

export function isActiveSurfacePath(filePath) {
	const normalized = filePath.replaceAll('\\', '/');
	if (normalized === 'specification/CHANGELOG.md' || normalized.startsWith('specification/conformance/')) return false;
	if (normalized.startsWith('specification/')) return normalized.endsWith('.md');
	if (normalized.startsWith('docs/src/content/docs/specification/')) return false;
	return normalized.startsWith('docs/src/content/docs/guides/') || normalized.startsWith('docs/src/content/docs/reference/');
}

export function validateDocument(filePath, content) {
	if (!isActiveSurfacePath(filePath)) return [];
	const errors = [];
	const lines = content.replaceAll('\r\n', '\n').split('\n');
	for (const [index, line] of lines.entries()) {
		for (const match of line.matchAll(retiredContinueCommand)) {
			if (!refusalGovernsOccurrence(line, match.index ?? 0, (match.index ?? 0) + match[0].length)) errors.push(`${filePath}:${String(index + 1)} teaches bot run --continue without an explicit refusal`);
		}
	}
	const paragraphs = content.replaceAll('\r\n', '\n').split(/\n\s*\n/u).map((paragraph) => paragraph.replaceAll(/\s+/gu, ' ').trim());
	if (paragraphs.some(promisesCompatibility)) errors.push(`${filePath} promises pre-1.0 compatibility for older assemblies`);
	return errors;
}

export function validateActiveSurface(documents) {
	return documents.flatMap(({ path, content }) => validateDocument(path, content));
}

async function markdownFiles(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...await markdownFiles(path));
		else if (entry.isFile() && entry.name.endsWith('.md')) files.push(path);
	}
	return files;
}

async function activeDocuments() {
	const roots = [join(repository, 'specification'), join(docs, 'src', 'content', 'docs', 'guides'), join(docs, 'src', 'content', 'docs', 'reference')];
	const files = (await Promise.all(roots.map(markdownFiles))).flat();
	return Promise.all(files.map(async (file) => ({
		path: relative(repository, file).replaceAll('\\', '/'),
		content: await readFile(file, 'utf8'),
	})));
}

const resumeAssertions = [
	['current resume spelling', (text) => text.includes('`bot run resume RUN`')],
	['donor-derived assembly', (text) => /derives? the assembly/iu.test(text)],
	['donor-derived flow', (text) => /derives? the assembly,?\s*optional flow/iu.test(text)],
	['donor-derived request', (text) => /derives? the assembly,?\s*optional flow,?\s*and retained request/iu.test(text)],
	['run resume controls and modes', (text) => /The command accepts `--home`, `--in`, declared slot paths, `--id-file`, bounded opaque `--correlation` metadata, and `--json` or `-j`/iu.test(text)],
	['correlation enters run_start and structured result', (text) => /`--correlation` enters `run_start` and the structured result/iu.test(text)],
	['JSON selects structured output', (text) => /`--json` and `-j` select structured output/iu.test(text)],
	['fresh run-control resolution', (text) => /current authored configuration.*resolve .*again/isu.test(text)],
	['plain-root carry boundary', (text) => /contiguous prefix of plain root stages/iu.test(text)],
	['LOOP carry boundary', (text) => /`LOOP`/u.test(text)],
	['CHOOSE carry boundary', (text) => /`CHOOSE`/u.test(text)],
	['PARALLEL carry boundary', (text) => /`PARALLEL`/u.test(text)],
	['FANOUT carry boundary', (text) => /`FANOUT`/u.test(text)],
	['DESCEND carry boundary', (text) => /`DESCEND`/u.test(text)],
];

test('the active documentation surface rejects retired runtime contracts', async () => {
	const documents = await activeDocuments();
	assert.deepEqual(validateActiveSurface(documents), []);
});

test('the retired-contract validator rejects its thirteen precise instructional forms', () => {
	assert.notDeepEqual(validateDocument('specification/elements/invocation.md', 'bot run --continue RUN\n'), []);
	assert.notDeepEqual(validateDocument('docs/src/content/docs/reference/invocation.md', '`bot run --continue RUN review/change "request"` starts a new run.\n'), []);
	assert.notDeepEqual(validateDocument('docs/src/content/docs/reference/invocation.md', 'Use `bot run --continue RUN` to continue the work.\n'), []);
	assert.notDeepEqual(validateDocument('docs/src/content/docs/reference/invocation.md', 'The old command `bot run --continue RUN` is refused; use `bot run --continue RUN` to continue the work.\n'), []);
	assert.notDeepEqual(validateDocument('specification/README.md', 'A later pre-1.0 runtime must continue to accept assemblies that use only stable 0.1 interfaces.\n'), []);
	assert.notDeepEqual(validateDocument('specification/README.md', 'A future pre-1.0 runtime will support older stable 0.1 assemblies.\n'), []);
	assert.notDeepEqual(validateDocument('specification/README.md', 'A future pre-1.0 runtime will not support older stable 0.1 assemblies, but will support stable 0.1 assemblies.\n'), []);
	assert.notDeepEqual(validateDocument('specification/README.md', 'A later pre-1.0 runtime will not support older stable 0.1 assemblies. It will support older stable 0.1 assemblies.\n'), []);
	assert.notDeepEqual(validateDocument('specification/README.md', '- A future pre-1.0 runtime will support older stable 0.1 assemblies.\n'), []);
	assert.notDeepEqual(validateDocument('specification/README.md', '> A future pre-1.0 runtime will support older stable 0.1 assemblies.\n'), []);
	assert.notDeepEqual(validateDocument('specification/README.md', '1. A future pre-1.0 runtime will support older stable 0.1 assemblies.\n'), []);
	assert.notDeepEqual(validateDocument('specification/README.md', '## A future pre-1.0 runtime will support older stable 0.1 assemblies.\n'), []);
	assert.notDeepEqual(validateDocument('specification/README.md', '> - A future pre-1.0 runtime will support older stable 0.1 assemblies.\n'), []);
});

test('the retired-contract validator permits refusal prose, negated compatibility, unrelated subjects, and excluded history', () => {
	assert.deepEqual(validateDocument('docs/src/content/docs/reference/invocation.md', 'The old command `bot run --continue` is refused.\n'), []);
	assert.deepEqual(validateDocument('specification/README.md', 'A future pre-1.0 runtime will no longer support older stable 0.1 assemblies.\n'), []);
	assert.deepEqual(validateDocument('specification/README.md', 'Operators will support older stable 0.1 assemblies, but a future pre-1.0 runtime will not support older stable 0.1 assemblies.\n'), []);
	assert.deepEqual(validateDocument('specification/README.md', 'A future pre-1.0 runtime will not support older stable 0.1 assemblies. Operators will support older stable 0.1 assemblies.\n'), []);
	assert.deepEqual(validateDocument('specification/CHANGELOG.md', 'A later pre-1.0 runtime must continue to accept assemblies that use only stable 0.1 interfaces.\n'), []);
});

test('the specification introduction states the accepted pre-release rule', async () => {
	const content = await readFile(join(repository, 'specification', 'README.md'), 'utf8');
	const normalized = content.replaceAll(/\s+/gu, ' ');
	assert.match(normalized, /Version `0\.0\.1` is the first public alpha\./u);
	assert.match(normalized, /Version 1\.0 is the first promised cross-version compatibility boundary\./u);
});

// The resume contract is stated once, in the format's own element document.
// `docs/.../reference/resume.md` used to repeat it sentence for sentence and
// now points at the specification anchor instead, so it is not checked here:
// a second copy is the thing that goes stale.
test('the maintained resume document states the accepted resume contract', async () => {
	const documents = await activeDocuments();
	const path = 'specification/elements/invocation.md';
	const document = documents.find((candidate) => candidate.path === path);
	assert.ok(document, `missing ${path}`);
	const normalized = document.content.replaceAll(/\s+/gu, ' ');
	for (const [label, assertion] of resumeAssertions) assert.equal(assertion(normalized), true, `${path} omits ${label}`);
});

// The reference page earns its place by sending the reader somewhere exact.
test('the resume reference page points at the specification rather than repeating it', async () => {
	const content = await readFile(join(repository, 'docs', 'src', 'content', 'docs', 'reference', 'resume.md'), 'utf8');
	assert.match(content, /\/specification\/running\/#resuming-a-run/u);
	const words = content.split('---')[2].trim().split(/\s+/u).length;
	assert.ok(words < 120, `the page carries ${String(words)} words and must stay under 120`);
});
