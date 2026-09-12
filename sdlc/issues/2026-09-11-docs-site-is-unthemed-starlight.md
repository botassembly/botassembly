# The documentation site is unthemed Starlight

Observed on botassembly.org on 2026-09-11. The site runs Starlight defaults: the system font stack, the Starlight blue accent (`#3369ff` light, `#3d50f5` dark), and no custom CSS. Nothing on the page says which project it belongs to. The brand source defines a complete visual system the site does not use.

## What the brand source defines

Catppuccin Latte for light and Catppuccin Mocha for dark. Outfit for display, Noto Sans for body, and Ioskeley Mono for code. The three font families are licensed under SIL OFL 1.1 or Apache 2.0.

## What a fix does

Self-host the three faces under `docs/public/fonts/` and copy the license notices beside them, as OFL 1.1 and Apache 2.0 require. Do not load fonts from a third-party host; the site must build and serve from this repository alone.

Set the Starlight CSS custom properties to the Catppuccin roles for both modes in one custom stylesheet registered through `customCss` in `docs/astro.config.mjs`. Map the accent, the text and background ramps, and the border and surface roles. Set code blocks and inline code to Ioskeley Mono.

Keep every font and color choice in that one stylesheet. Ian may swap the body or display face after seeing it rendered, and that swap should be one edit to one declaration, not a sweep.

## How it is verified

Screenshots of a representative documentation page and the home page at 1440 and 400 pixels wide, in both light and dark mode. Four widths times two modes on two pages. Check contrast on body text, code blocks, and link states in both modes.

## Depends on

The retired-mark finding filed the same day. The new mark sets the colors the accent has to sit beside.

## What branch `site` did

Self-hosted Outfit, Noto Sans, and Ioskeley Mono under `docs/public/fonts/` with
`LICENSES.md`; all three are SIL OFL 1.1, read from each font's name table. Put
the whole Catppuccin mapping in `docs/src/styles/brand.css` and registered it
through `customCss`. Set the Expressive Code themes to the Catppuccin flavors,
because CSS cannot reach syntax colors. `docs/review.sh` captures the four pages
at both widths in both modes. Decisions are in `sdlc/planning/site-theme.md`.
