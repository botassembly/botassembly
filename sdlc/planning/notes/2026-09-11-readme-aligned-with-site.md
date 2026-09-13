---
project: botassembly
date: 2026-09-11
status: done
---

# README aligned with the site

The repository README answered a different set of questions than the home page did, and it carried a second install recipe with its own configuration story. A newcomer who read both got two versions of the same setup.

The README now follows the home page. It opens with the home page's sentence, shows the same `examples/vtriage` tree and the same eight record lines that `Fold.astro` renders, and gives the command that produced them. Keeping those blocks byte-identical to `Fold.astro` is the rule; change one and change the other.

Install is the single recipe from `guides/first-assembly`, including the `0700` home, the `default` intelligence, and the platform line. Everything past that points at the guide. No second recipe lives in the README.

Four short answers follow, taken from the twenty-questions note: why not a script, how it differs from a graph library, what work it suits, and how far along it is. Then the three examples, the format and runtime split, the four limits the home page states, and the pointers.

Removed: the standalone configure section, the trust-boundary and compatibility essays that the site owns, and the duplicated develop instructions. The trust boundary survives as one bullet under "What it is not".

Commands use the noun spellings only: `bot run list`, `bot run show`, `bot run output`, `bot check`, `bot show`. Each was confirmed against `bot <command> --help`.
