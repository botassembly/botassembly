# A stage file with nothing to configure still needs an empty front matter fence

Invariant 42 says every stage file and sentinel is front matter and body, everywhere. A stage file that sets no option must still open with `---` and `---` on two lines, and `bot check` refuses one that does not with `frontmatter-invalid`. `sdlc/scripts/examples` fails on the same file.

Observed on 2026-09-11 while trimming `examples/triage`: three of the five stage files carry an empty fence. The home page walkthrough shows those files verbatim, and a fresh-eyes reviewer read the two bare lines as noise before reading the prompt. The walkthrough now spends a sentence explaining the empty fence on step 3.

The cost falls on every author of a plain stage: two lines that say nothing, and a refusal by name if they are forgotten. The record shows the rule exists so a parser can treat every document one way. The site copy and the example files hold the rule for now.

## Disposition (2026-09-12)

Status: retained accepted contract observation and later format opportunity.
The empty fence is current and documented; changing it would be a pre-1.0
format decision. Review after a concrete authoring complaint or on 2026-12-12.
