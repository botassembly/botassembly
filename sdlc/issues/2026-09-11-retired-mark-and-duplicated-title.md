# The site still ships the retired mark and a duplicated page title

Observed on botassembly.org on 2026-09-11. The published site is live through GitHub Pages and carries brand assets the project has retired. This is the smallest of the five website findings filed today and should land first, because the later theming and copy work assumes the new mark is in place.

## What is wrong

The header logo is `docs/src/assets/botassembly-mark.svg` and the browser icon is `docs/public/favicon.svg`. Both are the folder-with-eyes mark, which is retired. The brand source now defines a three-squares folder mark with a shell-line lockup.

The page title renders as "Bot Assembly | Bot Assembly". Starlight appends the site title to each page title, and `docs/src/content/docs/index.mdx` sets its own `title: Bot Assembly`, so the home page states the name twice.

## What a fix does

Replace both SVG files with the current mark exported from the brand source. Copy the assets into `docs/` so this repository stays self-contained and builds without reaching anything outside it. Keep the mark legible at favicon size and in both color modes.

Fix the duplicated title. Starlight's `titleDelimiter` or a per-page title override in `index.mdx` both reach it; pick one and keep it in `docs/astro.config.mjs` if the choice is site-wide.

## Boundary

No color, font, or copy change belongs here. Those are separate findings.

## What branch `site` did

Replaced both SVGs with the three-squares folder mark built from the brand
source, added a light and a dark header lockup with the wordmark outlined from
Ioskeley Mono, and set `logo: { light, dark, replacesTitle: true }`. Set the
site title to `botassembly` with `·` as the delimiter and overrode the home
page's own `<title>`. Decisions are in `sdlc/planning/site-theme.md`.
