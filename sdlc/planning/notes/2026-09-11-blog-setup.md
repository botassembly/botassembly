---
project: botassembly
date: 2026-09-11
status: decided
---

# Standing up the blog

The blog lives inside this docs site at `/blog/`. A post is a markdown file in the repository it describes, reviewed in the same pull request and published by the same workflow. No second stack, no second deploy, no second brand. Every decision here can be overturned.

## The plugin

`starlight-blog` **0.29.0**, exact-pinned in `docs/package.json`. Its peer range is `@astrojs/starlight >= 0.41.0` and the site is on 0.41.7.

The configuration in `docs/astro.config.mjs`:

| Option | Value | Why |
| --- | --- | --- |
| `prefix` | `blog` | posts publish under `/blog/` |
| `title` | `botassembly blog` | the header link and the feed title |
| `rss` | `true` | the feed is what makes syndication honest |
| `navigation` | `none` | no post is published, so no link points at an empty blog |
| `authors` | `ian` → `Ian Maurer` | one global author, referenced by key in frontmatter |

`docs/src/content.config.ts` extends the docs collection with `blogSchema` from `starlight-blog/schema`, so posts carry the blog frontmatter on top of Starlight's own.

**Turning the links back on.** When the first post drops its `draft: true`, set `navigation` back to `'header-start'` in `docs/astro.config.mjs` and delete the `.social-icons a[href$='/blog/rss.xml']` block at the end of `docs/src/styles/brand.css`.

`navigation: 'none'` drops the header link and the mobile sidebar entry the plugin injects. `/blog/` still answers by URL, and `/blog/rss.xml` is still built.

## Where posts live

`docs/src/content/docs/blog/<slug>.md`. Frontmatter needs `title`, `date`, `authors`, and a `description`. `tags` and `excerpt` are optional and both are used by the first post.

Give `date` a time and a zone, not a bare day. A bare `2026-09-11` parses as UTC midnight and renders as the tenth in every timezone west of London. The first post carries `2026-09-11T12:00:00Z`.

## Draft to published

`draft: true` keeps a post out of production. Starlight drops draft entries from the production route set, so the page itself is never emitted, and `starlight-blog` skips drafts when it builds the post list, the tag pages, and the feed. `astro dev` still renders the page with a notice on it, which is how a draft gets reviewed.

Flipping a draft to published is deleting the `draft: true` line. Nothing else moves.

Verified on 2026-09-11: with the first post drafted, `npm run build --prefix docs` emits `dist/blog/index.html` with no posts listed and `dist/blog/rss.xml` with no items. No file in `dist` contains the post.

## Syndication

Every post is canonical at botassembly.org. Syndicated copies link back to the canonical URL and are never full cross-posts. This blog carries the principles series and the build story. Ian's personal blog carries the opinion and the retrospective. Each sibling product site carries its own product news.

## Navigation test

`docs/scripts/navigation.test.mjs` asserts every documentation page appears in exactly one sidebar group. Blog posts are now excluded from that assertion. The plugin owns their navigation: the post list, the tag and author pages, and the prev/next links.

The same test located the close of the `starlight()` call by searching for `\t\t}),` from the start of the file. The plugin options above the sidebar close at a deeper indent that also ends in those bytes, so the search now starts at the sidebar.

## The first post

`docs/src/content/docs/blog/a-folder-in-a-record-out.md`, drafted, 789 words. It puts an `ls -R` of `examples/vtriage` beside twelve verbatim lines of the record that example's sealed run left.

## Brand review

`docs/review.sh` now captures `/blog/` alongside the other pages. It serves `dist`, where a draft does not exist, so the post page was reviewed against `astro dev` instead. Shots at 1440 and 400 in both modes went to `/tmp/brand-review/blog/`.

Three defects the screenshots caught:

1. The post date rendered as 10 September. Fixed by giving the frontmatter date a time and a zone.
2. The Blog link vanished below 50rem. Fixed with the plugin's mobile sidebar entry.
3. The Astro dev toolbar sat on top of the first code block in every full-page capture. Removed in the capture script, not in the page.

## Voice misses fixed in the draft

Checked against the voice skill's list. Four misses, all fixed:

1. A trailing `which is` clause on the checklist sentence. Split into two sentences, and Atul Gawande is now credited by name rather than by allusion.
2. A trailing `so nobody has to` clause on the gate paragraph. Split into three sentences.
3. A trailing `because` clause on the review paragraph. Split, and the one remaining `because` line was kept because the piece is allowed one.
4. Four ideas welded into two sentences in the folder walkthrough. Split so every sentence is subject, verb, object.

No em-dashes, no parenthetical asides, no hype words, and no superlatives about our own work survived the pass. The piece keeps one aphorism and no metaphors, names real files and real numbers, asks the reader's question about a YAML file and answers it, and states two limits plainly: Bot is not containment, and the published record's hashes no longer recompute because its paths were rewritten.
