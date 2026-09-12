---
project: botassembly
date: 2026-09-11
status: unfolded
---

# Third review: the components half

The third live-site review listed seven defects in the docs components. This note records what each fix does and why the shape was chosen. Every claim below was checked in a screenshot of the built site served by `astro preview`, at 1440 and 400, in both modes. The shots are not committed; the loop is `repos/mktg/skills/brand-design/SKILL.md`.

## Decisions

**A code block that scrolls says so in three background layers, not a script.** Every `pre` that can run wider than its column carries an accent rule and a wash at its right edge. The layers are pure CSS: a card-colored cover attached `local`, so it travels with the text and sits at the far end of it, over an accent rule and wash attached `scroll`, pinned to the box. While text remains to the right the rule shows; once the reader scrolls to the end the cover hides it; a block that fits never shows it at all. No JavaScript, and nothing to run on load. The same treatment turned on its side marks the bottom of the explorer's check output.

A script was the alternative. It was rejected because the only site-wide hook for one is `astro.config.mjs`, which carries the sidebar and belongs to another change.

**Scrollbar styling is asserted, not verified.** `::-webkit-scrollbar` on those blocks is 8px with an accent thumb. `scrollbar-width` and `scrollbar-color` are deliberately absent: Chromium ignores the `-webkit-` pseudo-elements on any element that sets either, and falls back to an overlay bar that fades away. The styling cannot be seen in the review loop, because Playwright launches Chromium with `--hide-scrollbars` and every screenshot is taken without one. The edge marker is the affordance that was verified.

**The file viewer shows bytes, not typography.** A YAML fence read as one long rule. The cause is the mono face's contextual substitution joining `---`, not a character replacement anywhere in the pipeline; the extractor ships the three bytes. The viewer now sets `font-variant-ligatures: none` and turns `liga`, `clig`, `calt` and `dlig` off. The rest of the site keeps its ligatures.

**A case is picked by its shape.** `extract-corpus.mjs` derives one line per accept case at build time: the stage count, then any container type the case holds (`CHOOSE`, `FANOUT`, `LOOP`, `PARALLEL`), then `skills` and `subflows` if a stage carries either. `docs-inert · 6 stages · PARALLEL`. The picker is sorted by stage count descending, so the default case is `shape-nesting` with fourteen stages and three container kinds instead of a one-stage case. A test pins the summary of two cases.

**Paths break only at a slash.** `paths.mjs` splits a path into directory segments and a file name; the template and the client script both use it, and a `<wbr>` follows every segment. The name itself never breaks, so `01-answer.md` no longer reads as two files. Case ids still break at their hyphens, which is the browser's own opportunity and reads correctly.

**The two panes end together.** Side by side, each pane is a flex column with a floor of 26rem and its scrolling region takes the slack, so a one-stage case no longer leaves the right column ending a screenful above the left.

**On a phone the refusal comes first.** The mistake list is long enough to push the result off the screen, so under 62rem the result pane takes `order: -1`. The list reads under it. A sticky panel was the alternative and was not needed once the order changed.

**A group says when its code is not its case names.** Ten of the refusal groups hold a case named for something other than the code the runtime reports, `key-missing` holding `value-invalid-profile-empty` among them. Those groups carry one line under the header: `code the runtime reports · case names are the corpus's own`. The flag is computed from the data, not listed by hand.

**The runtime reference lede is styled from the markup that is already there.** The nine `reference/` pages open with a whole-paragraph italic. No class, no wrapper, and the content pages belong to another change, so the rule is keyed on `.sl-markdown-content > p:first-child > em:only-child`. That selector matches those nine pages and nothing else in the site today: the specification pages open with a `strong` inside a paragraph that carries other text, so they do not match. It renders as a bordered note rather than a lede. If a future page opens with a fully italic first paragraph it will pick up the style, which is the cost of keying on shape instead of a class.

## Left open

- Both explorer pages set `tableOfContents: false`, because their rail held one entry. If either page grows a second heading the frontmatter has to come back.
- The scrollbar styling is unverified by screenshot for the reason above. A real browser check is the lever.
