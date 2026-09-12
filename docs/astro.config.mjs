// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightBlog from 'starlight-blog';

// https://astro.build/config
export default defineConfig({
	site: 'https://botassembly.org',
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
			// Two groups carry the argument. Format is what you own: a folder
			// contract with a versioned specification and a conformance corpus.
			// Runtime is bot, one implementation of it. Every page appears in
			// exactly one group; sidebar-coverage.test.mjs enforces that.
			sidebar: [
				{
					label: 'Start',
					items: [
						{ label: 'Your First Assembly', slug: 'guides/first-assembly' },
						{ label: 'The format and the runtime', slug: 'format-and-runtime' },
						{ label: 'Authoring Assemblies', slug: 'guides/authoring-assemblies' },
						{ label: 'Operating runs', slug: 'guides/install-and-use' },
					],
				},
				{
					// Generated from specification/*.md by scripts/generate-specification.mjs,
					// which wipes and rewrites that directory on every build, so the
					// two authored explorers live in docs/.../format/ instead. The
					// worked example is a walkthrough rather than law, so it sits
					// second, right after the overview that sends a reader to it.
					label: 'Format',
					items: [
						{ slug: 'specification/overview' },
						{ label: 'The Worked Example', slug: 'specification/example' },
						{ label: 'Explore an Assembly', slug: 'format/explore' },
						{ label: 'Explore a Refusal', slug: 'format/refusals-explorer' },
						{ slug: 'specification/structure' },
						{ slug: 'specification/slots-and-skills' },
						{ slug: 'specification/graph' },
						{ slug: 'specification/gating' },
						{ slug: 'specification/running' },
						{ slug: 'specification/refusals' },
						{ slug: 'specification/record' },
						{ slug: 'specification/invariants' },
						{ slug: 'specification/conformance' },
					],
				},
				{
					label: 'Runtime',
					items: [{ autogenerate: { directory: 'reference' } }],
				},
				// Two tail pages, one each. Starlight takes a bare link entry at
				// the top level, so neither wears a group heading over a single
				// child. Add a group back the day either grows a sibling.
				{ label: 'Principles', slug: 'principles' },
				{ label: 'Development and Testing', slug: 'project/development' },
			],
		}),
	],
});
