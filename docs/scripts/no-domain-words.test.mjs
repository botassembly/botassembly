// The site is written for a domain expert who writes no code, and the worked
// examples are everyday knowledge work: a welcome note, a support request, a
// weekly digest, a report outline. Earlier drafts borrowed a clinical example
// and the vocabulary spread through the guides. This guard scans every
// published page and fails on any of those words, so the drafts cannot come
// back one paste at a time.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const docs = dirname(dirname(fileURLToPath(import.meta.url)));
const content = join(docs, 'src', 'content', 'docs');

// Whole words only. "invariant" holds "variant", "distinct" holds "nct", and
// "collaborate" holds "lab", and every one of those is ordinary software
// prose. The boundaries are what keep this guard from crying wolf.
const banned = [
	'patholog[a-z]*',
	'lab',
	'labs',
	'laborator[a-z]*',
	'specimen[a-z]*',
	'patient[a-z]*',
	'clinic',
	'clinical',
	'clinician[a-z]*',
	'genomic[a-z]*',
	'genome[a-z]*',
	'molecular',
	'oncolog[a-z]*',
	'variant',
	'variants',
	'trial',
	'trials',
	'NCT[0-9]*',
	'curation',
	'curator[a-z]*',
	'biomarker[a-z]*',
];
const insensitive = new RegExp(String.raw`\b(?:${banned.join('|')})\b`, 'giu');
// LIS is a laboratory information system, and lowercase "lis" is a fragment of
// ordinary words, so this one word is matched with its own case kept.
const sensitive = /\bLIS\b/gu;

async function pages(directory) {
	const found = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			found.push(...await pages(path));
		} else if (/\.mdx?$/u.test(entry.name)) {
			found.push(path);
		}
	}
	return found.sort();
}

function hits(text) {
	return [...text.matchAll(insensitive), ...text.matchAll(sensitive)].map((match) => match[0]);
}

test('every word in the list is caught on its own', () => {
	assert.deepEqual(hits('The patient trial NCT05123456 needs curation, per LIS.'), [
		'patient',
		'trial',
		'NCT05123456',
		'curation',
		'LIS',
	]);
});

test('the ordinary software words the boundaries protect are left alone', () => {
	assert.deepEqual(hits('An invariant, a distinct list, a collaborative diagnostic, a distinctive label.'), []);
});

test('no published page uses a word from the domain the examples left behind', async () => {
	const offences = [];
	for (const path of await pages(content)) {
		const text = await readFile(path, 'utf8');
		for (const [index, line] of text.split('\n').entries()) {
			for (const word of hits(line)) {
				offences.push(`${relative(content, path)}:${String(index + 1)}  ${word}`);
			}
		}
	}
	assert.deepEqual(offences, [], `Rewrite these with the shipped examples instead:\n${offences.join('\n')}`);
});
