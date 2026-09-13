# Documentation site theme

Branch `site`. Two issues drove this: the retired mark with a duplicated page
title, and the unthemed Starlight defaults. No ticket number was assigned, so
the decisions live here. Every one of them is reversible in one edit.

## The mark and the lockup

`docs/src/assets/botassembly-lockup-light.svg` and `-dark.svg` are the header
lockup, `$ folder | botassembly`. The wordmark, the `$`, and the `|` are
outlined paths extracted from Ioskeley Mono, not text. An SVG used as an `<img>`
does not load web fonts, and Starlight renders a logo as an `<img>`, so text
would have fallen back to a system face on every visitor's machine. Outlining
removes the dependency. The tradeoff is that a wordmark edit means regenerating
the file rather than editing a string.

Two files rather than one because Starlight takes `logo: { light, dark }` and
switches on the theme. The colors are the Latte and Mocha lockup values from the
brand source, held in CSS variables inside each file.

`docs/public/favicon.svg` is the mark alone in a square frame, with the folder
outline switching on `prefers-color-scheme`. The squares keep sapphire, mauve,
and peach in both modes. `docs/src/assets/botassembly-mark.svg` is the same
file; the splash hero uses it.

## The title

Starlight renders `<page title> <delimiter> <site title>`. The site title is now
`botassembly` and the delimiter is `·`, so an interior page reads
"Page · botassembly". The home page sets its own `<title>` through frontmatter
`head`, so it reads `botassembly` once instead of twice. `replacesTitle: true`
keeps the header from printing the name beside the lockup.

## The palette and the faces

`docs/src/styles/brand.css` is the whole theme, registered through `customCss`.
Starlight's `:root` is its dark mode, so `:root` carries Mocha and
`:root[data-theme='light']` carries Latte. The brand's ten roles are declared as
`--ba-*` variables and Starlight's `--sl-*` properties read from them, so
swapping a role is one line.

Three decisions inside that file are worth naming.

Body text is subtext1, not the muted role. Muted `#6c6f85` on the Latte ground
is 4.3:1, which fails WCAG AA. `#5c5f77` is 5.3:1.

The nav and the sidebar sit on the card role and the content sits on the ground.
Starlight's default puts the chrome on a lighter surface than the page; this
inverts that in light mode, where the card is white.

Card icon badges all use the accent. Starlight cycles them through orange,
green, red, and blue by index. The brand keeps status hues out of decoration.

The three faces are self-hosted under `docs/public/fonts/`. Outfit and Noto Sans
were converted from TrueType to WOFF2; Ioskeley Mono ships as received. All
three are SIL OFL 1.1, confirmed by reading each font's own name table rather
than a web page; `docs/public/fonts/LICENSES.md` carries the notices and the
license text. The Outfit and Noto files are Latin-only subsets, so a page in a
non-Latin script would fall back to the system face.

Outfit Bold, Noto Sans Regular, and Ioskeley Mono Regular are preloaded from
`astro.config.mjs`. Without the preload, headings blanked out during the
`font-display` block period and screenshots caught pages with no headings.

Syntax colors are set in `astro.config.mjs`, not in the stylesheet, because CSS
cannot reach them. Expressive Code takes the Shiki-bundled `catppuccin-mocha`
and `catppuccin-latte` themes.

## Verifying it

`docs/review.sh` captures four pages at 1440 and 400 pixels wide in both modes
against a served `docs/dist`. Run it after a clean build: Astro's incremental
build served stale HTML against a fresh Expressive Code stylesheet once during
this work, which produced uncolored code blocks and a broken code frame that
looked like a CSS defect and was not one. `rm -rf docs/dist docs/.astro` first.
