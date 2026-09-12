---
flow: build
priority: 11
waits-on: ["botassembly/sdlc/0156", "botassembly/sdlc/0157", "botassembly/sdlc/0158", "botassembly/sdlc/0159"]
---
# Botassembly adopts the current canonical project scripts

`factory doctor` reports all five of this repository's `sdlc/project` scripts as drifted from SDLC's canonical set. The latest local propagation was 2026-08-22; canonical changes since then added visible numbered drafts, refreshed deployment health, owned-orphan worktree recovery, and now a generic project deploy hook. Botassembly has no intentional lifecycle customization, so the drift is undeployed shared behavior rather than a local design choice.

After SDLC 0156 establishes the deploy-hook extension, SDLC 0157 makes propagation refuse unproven committed divergence, and SDLC 0158 and 0159 complete the landing and withdrawal repairs found in the same review, adopt the then-current canonical files through the supported propagation path.

## What done looks like, observably

- `sdlc/project/tasks`, `before`, `success`, `failure`, and `health` match SDLC's deployed canonical files byte-for-byte and mode-for-mode.
- The propagation proof uses a temporary project registry containing only this attempt's Botassembly worktree. It must not invoke zero-argument propagation against the deployed live registry or modify any other registered checkout while this ticket runs.
- The owned-orphan recovery added by SDLC 0151 is exercised against this repository: an unregistered directory with a regular `.git` pointer into botassembly's own common Git directory is reclaimed, while a foreign repository, symlink, malformed pointer, and ordinary directory are refused and left untouched.
- The current numbered-draft visibility, origin-refresh health, blocked-attempt cleanup, baseline cleanup, and optional deploy-hook behavior retain their canonical tests. This ticket does not select only the incident fix and leave the other four files stale.
- Botassembly has no `sdlc/scripts/deploy` hook, so the new optional extension is a no-op here.
- After landing, botassembly no longer appears in `factory doctor`'s project-script drift report. Other repositories may still keep the command nonzero until their adoption tickets land.

## Hard choices settled here

The files are copied, not locally reimplemented. Any Botassembly-specific lifecycle need must live behind a canonical extension or in a project-owned `sdlc/scripts` hook; it may not create another private lifecycle fork.

Adoption waits for SDLC 0157 because today's propagation command would overwrite any clean committed divergence without proving provenance. This repository is believed to contain only an older canonical copy, but the tool must establish that rather than this ticket assuming it.

## Boundary

- No Botassembly runtime, CLI, assembly, or provider behavior changes.
- No project-specific deploy hook is introduced.
- No BioMCP files or project registration changes.
- No Deck, Factory, SDLC, or BioMCP registered checkout is modified by this ticket's adoption command.
