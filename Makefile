.PHONY: help check smoke install uninstall installcheck

# The root coordinates the existing offline project checks. `bot/Makefile`
# owns their implementation. Smoke remains the separate live-model ladder.

# Bare `make` must never spend money (ticket 0158): `smoke` is the first
# target in the file, so without this line it was the default goal and the
# universal reflex of typing `make` in a fresh clone fired the live ladder.
.DEFAULT_GOAL := help
help:
	@echo 'This Makefile coordinates the complete offline check, packaging, and live ladder.'
	@echo '  make check         run every offline project check'
	@echo '  make install       write the bot launcher to ~/.local/bin'
	@echo '  make uninstall     remove that launcher'
	@echo '  make installcheck  test install from a path containing a space'
	@echo '  make smoke         the LIVE ladder — costs money, run deliberately'

check:
	sh sdlc/scripts/spec
	sh sdlc/scripts/lint
	sh sdlc/scripts/test

# The smoke ladder (ticket 0062): five live-model acceptance runs and one
# post-run inspection rung, deliberate and never part of `make check`.
# The complete check calls no model. `make smoke SMOKE=3` runs one
# rung. A fresh worktree needs `make -C bot install` first.
smoke:
	@smoke/run.sh $(SMOKE)

# Packaging (ticket 0058): v0 is `git clone` + `make install`. The repository
# root is read from this Makefile's own path, never from $PWD, so the launcher
# points at THIS checkout whatever directory you installed from. `git pull` is
# the upgrade path; move the checkout and re-run `make install`.
#
# That path is derived by the shell in the recipe rather than by Make's
# $(abspath)/$(dir) (ticket 0132): every Make function splits its argument on
# whitespace, so a checkout under a directory whose name contains a space came
# out truncated at the first space — `make install` reported success and the
# launcher it wrote then died on a path that was not the checkout.
# $(MAKEFILE_LIST) holds the path verbatim, and holds exactly one entry: this
# Makefile includes nothing. Anything that gives it a second entry — an
# `include` line, or a MAKEFILES in the environment — needs this rewritten,
# and cannot be answered with $(lastword), which is the very splitting being
# avoided here.
#
# The residual limit, shared with every other path interpolation in this file:
# a checkout or BINDIR containing a single quote defeats the quoting.
BINDIR := $(HOME)/.local/bin
LAUNCHER := $(BINDIR)/bot
# The line that makes a launcher recognizably ours. `install` refuses to
# replace a file that lacks it and `uninstall` refuses to delete one, so a
# `bot` on the PATH that some other project wrote is never touched silently.
MARKER := bot-assembly launcher

install:
	@mkdir -p '$(BINDIR)'
	@if [ -e '$(LAUNCHER)' ] && [ -z '$(FORCE)' ] && ! grep -qF '$(MARKER)' '$(LAUNCHER)' 2>/dev/null; then \
		echo 'refused: $(LAUNCHER) exists and this project did not write it.' >&2; \
		echo 'Move it aside, or re-run as `make install FORCE=1` to replace it.' >&2; \
		exit 2; \
	fi
# Plain `node`, no --experimental-strip-types (ticket 0132): package.json
# requires node >=22.22, and every node from 22.18 on strips types with no
# flag, so on each version this project supports the flag did nothing — and an
# experimental flag is a spelling free to change under a launcher that has to
# keep working.
	@repo=$$(CDPATH= cd -- "$$(dirname -- '$(MAKEFILE_LIST)')" && pwd) && \
	printf '%s\n' \
		'#!/bin/sh' \
		"# $(MARKER) — written by \`make install\` in $$repo" \
		'# Re-run that after moving the checkout; `make uninstall` removes this file.' \
		'# Node below 22.22 cannot load TypeScript and dies in a resolver stack' \
		'# trace, so the launcher answers with a sentence instead (ticket 0158).' \
		'v=$$(node -v 2>/dev/null) || { echo "bot needs Node 22.22 or newer; node was not found on PATH." >&2; exit 2; }' \
		'case "$$v" in' \
		'  v22.2[2-9].*|v22.[3-9][0-9].*|v2[3-9].*|v[3-9][0-9].*|v[1-9][0-9][0-9].*) ;;' \
		'  *) echo "bot needs Node 22.22 or newer; this node is $$v." >&2; exit 2 ;;' \
		'esac' \
		"exec node '$$repo/bot/src/cli.ts' \"\$$@\"" > '$(LAUNCHER)' && \
	chmod 755 '$(LAUNCHER)' && \
	echo 'installed: $(LAUNCHER)' && \
	echo "       ->  node $$repo/bot/src/cli.ts"
# The advice names the directory just installed into (ticket 0132): it used to
# read $HOME/.local/bin whatever BINDIR said, so `make install BINDIR=...` ended
# by telling you to put a different directory on your PATH. The emitted line is
# pasted into a shell profile as it stands, so BINDIR goes inside double quotes
# — a space in it survives, and $PATH is still the reader's to expand. Unlike
# the launcher, that leaves a BINDIR containing `$` or a backtick advising a
# line that would misbehave when pasted; single quotes there would spare that
# and cost the expansion this line exists for.
	@case ":$$PATH:" in \
		*":$(BINDIR):"*) ;; \
		*) echo 'WARNING: $(BINDIR) is not on your PATH, so `bot` will not be found.' >&2; \
		   echo 'Add this line to your shell profile and open a new shell:' >&2; \
		   echo '  export PATH="$(BINDIR):$$PATH"' >&2 ;; \
	esac

# Packaging's witness (ticket 0132): installs this checkout from a scratch path
# whose name contains a space and runs the launcher it wrote. Deliberate, not
# part of `make check` — the offline gate tests the runtime, and this
# tests the two targets above it. Run it after touching either of them.
installcheck:
	@scripts/installcheck.sh

uninstall:
	@if [ ! -e '$(LAUNCHER)' ]; then \
		echo 'not installed: $(LAUNCHER)'; \
	elif grep -qF '$(MARKER)' '$(LAUNCHER)' 2>/dev/null; then \
		rm -f '$(LAUNCHER)'; \
		echo 'removed: $(LAUNCHER)'; \
	else \
		echo 'refused: $(LAUNCHER) exists but this project did not write it — left alone.' >&2; \
		exit 2; \
	fi
