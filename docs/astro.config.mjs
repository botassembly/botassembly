// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightBlog from 'starlight-blog';

// https://astro.build/config
export default defineConfig({
	site: 'https://botassembly.org',
	// Every authored URL the 2026-09-14 rewrite retired answers here instead of
	// 404ing. docs/scripts/redirects.test.mjs is the list and the proof.
	redirects: {
		'/guides/first-assembly/': '/start/install/',
		'/guides/install-and-use/': '/start/run-the-example/',
		'/guides/authoring-assemblies/': '/build/stages-and-checks/',
		'/format-and-runtime/': '/understand/format-and-runtime/',
		'/principles/': '/understand/principles/',
		'/format/explore/': '/build/explore/',
		'/format/refusals-explorer/': '/operate/refusals-explorer/',
		'/reference/invocation/': '/reference/commands/',
		'/reference/resume/': '/reference/commands/',
		'/reference/inspection/': '/operate/reading-a-record/',
		'/reference/management/': '/build/sharing/',
		'/reference/models/': '/operate/providers-and-credentials/',
		'/reference/auth/': '/operate/providers-and-credentials/',
		'/reference/agent-tools/': '/operate/before-you-pilot-it/',
		'/reference/trust-boundary/': '/operate/before-you-pilot-it/',
		'/reference/limits/': '/operate/before-you-pilot-it/',
	},
	integrations: [
		starlight({
			title: 'botassembly',
			// The blog lives inside the docs site: a post is a markdown file in
			// the repository it describes, reviewed in the same pull request and
			// published by the same workflow. Nothing is published yet, so
			// `navigation: 'none'` drops the header and mobile sidebar links the
			// plugin would add. /blog/ still answers by URL and the feed is still
			// built. brand.css hides the RSS icon the plugin puts in the social
			// row. sdlc/planning/notes/2026-09-11-blog-setup.md says how to turn
			// the links back on.
			plugins: [
				starlightBlog({
					title: 'botassembly blog',
					prefix: 'blog',
					rss: true,
					navigation: 'none',
					authors: {
						ian: { name: 'Ian Maurer' },
					},
				}),
			],
			// "Page · botassembly" in the tab. The home page overrides its own
			// title in index.mdx so it reads "botassembly" once, not twice.
			titleDelimiter: '·',
			logo: {
				light: './src/assets/botassembly-lockup-light.svg',
				dark: './src/assets/botassembly-lockup-dark.svg',
				replacesTitle: true,
			},
			customCss: ['./src/styles/brand.css'],
			// Syntax colors are the one part of the palette CSS cannot reach.
			// Shiki ships both Catppuccin flavors; dark first, light second.
			expressiveCode: { themes: ['catppuccin-mocha', 'catppuccin-latte'] },
			// Preload the three faces the first screen needs. Without this the
			// headings blank out during the font-display block period.
			head: [
				{
					tag: 'link',
					attrs: { rel: 'preload', href: '/fonts/Outfit-Bold.woff2', as: 'font', type: 'font/woff2', crossorigin: 'anonymous' },
				},
				{
					tag: 'link',
					attrs: { rel: 'preload', href: '/fonts/NotoSans-Regular.woff2', as: 'font', type: 'font/woff2', crossorigin: 'anonymous' },
				},
				{
					tag: 'link',
					attrs: { rel: 'preload', href: '/fonts/IoskeleyMono-Regular.woff2', as: 'font', type: 'font/woff2', crossorigin: 'anonymous' },
				},
			],
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/botassembly/botassembly',
				},
			],
			// Six groups, one job each. Start is the reading path in order.
			// Build and Operate are how-to. Understand is explanation. Reference
			// is lookup, with the generated specification collapsed inside it.
			// Every page appears in exactly one group; navigation.test.mjs
			// enforces that and redirects.test.mjs enforces the retired URLs.
			sidebar: [
				{
					label: 'Start',
					items: [
						{ label: 'What it is', link: '/' },
						{ label: 'Why not a script', slug: 'start/why-not-a-script' },
						{ label: 'Install', slug: 'start/install' },
						{ label: 'Run the shipped example', slug: 'start/run-the-example' },
						{ label: 'Write your own', slug: 'start/write-your-own' },
					],
				},
				{
					label: 'Build',
					items: [
						{ label: 'Stages and checks', slug: 'build/stages-and-checks' },
						{ label: 'Control flow', slug: 'build/control-flow' },
						{ label: 'Skills and slots', slug: 'build/skills-and-slots' },
						{ label: 'Sharing an assembly', slug: 'build/sharing' },
						{ label: 'Explore an assembly', slug: 'build/explore' },
					],
				},
				{
					label: 'Operate',
					items: [
						{ label: 'Reading a record', slug: 'operate/reading-a-record' },
						{ label: 'Providers, models, and credentials', slug: 'operate/providers-and-credentials' },
						{ label: 'When it refuses or fails', slug: 'operate/when-it-refuses' },
						{ label: 'Explore a refusal', slug: 'operate/refusals-explorer' },
						{ label: 'Before you pilot it', slug: 'operate/before-you-pilot-it' },
					],
				},
				{
					label: 'Understand',
					items: [
						{ label: 'A folder in, a record out', slug: 'understand/folder-in-record-out' },
						{ label: 'The format and the runtime', slug: 'understand/format-and-runtime' },
						{ label: 'Principles', slug: 'understand/principles' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'Command reference', slug: 'reference/commands' },
						{ label: 'Library reference', slug: 'reference/library' },
						{
							// Generated from specification/*.md by
							// scripts/generate-specification.mjs, which wipes and
							// rewrites that directory on every build. Collapsed, so the
							// format's law is a destination rather than a third of the nav.
							label: 'Specification',
							collapsed: true,
							items: [{ autogenerate: { directory: 'specification' } }],
						},
					],
				},
				{
					label: 'Project',
					items: [{ label: 'Development and testing', slug: 'project/development' }],
				},
			],
		}),
	],
});
