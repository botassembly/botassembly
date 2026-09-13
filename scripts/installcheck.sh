#!/bin/sh
# `make installcheck` (ticket 0132) — packaging's own witness, not part of the
# gate. It installs this checkout's launcher from a path whose name contains a
# space and runs it, because that is the shape that broke: `make install`
# printed success and the launcher it wrote died on a truncated path.
#
# It is a real `make install` against a real copy, not a check of the launcher
# text against a stub, because half the defect lived in Make's own path
# arithmetic ($(abspath) splits on whitespace) rather than in the text it
# emitted. A witness that only inspected the emitted text would have watched
# the wrong half.
#
# Everything it writes goes under a scratch directory it makes and removes:
# never the real ~/.local/bin, never the real bot home. It needs `bot/`'s
# node_modules, which it borrows read-only by symlink rather than installing.
set -eu

repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

if [ ! -d "$repo/bot/node_modules" ]; then
	echo 'installcheck: bot/node_modules is missing — run `npm ci` in bot/ first.' >&2
	exit 2
fi

scratch=$(mktemp -d "${TMPDIR:-/tmp}/bot-installcheck.XXXXXX")
trap 'rm -rf "$scratch"' EXIT INT TERM

# `fail MESSAGE [FILE]` — the file, when given, is the output that earned it.
fail() {
	echo "installcheck: $1" >&2
	if [ "$#" -gt 1 ]; then
		cat "$2" >&2
	fi
	exit 1
}

# The space is the whole point of the fixture; keep it.
checkout="$scratch/sp ace/checkout"
bindir="$scratch/sp ace/bin"
mkdir -p "$checkout/bot" "$bindir"

# The least that makes a launcher runnable: the Makefile under test, the CLI
# source, and the package.json whose "type": "module" decides how node reads it.
cp "$repo/Makefile" "$checkout/Makefile"
cp "$repo/bot/package.json" "$checkout/bot/package.json"
cp -R "$repo/bot/src" "$checkout/bot/src"
ln -s "$repo/bot/node_modules" "$checkout/bot/node_modules"

make -C "$checkout" install BINDIR="$bindir" >"$scratch/install.out" 2>&1 ||
	fail 'make install failed:' "$scratch/install.out"

launcher="$bindir/bot"
if [ ! -x "$launcher" ]; then
	fail 'make install reported success but wrote no executable launcher:' "$scratch/install.out"
fi

# The launcher must name the checkout whole. Before the fix it named
# "$scratch/sp" — success on stdout, a truncated path in the file.
if ! grep -qF "$checkout/bot/src/cli.ts" "$launcher"; then
	fail 'launcher does not name the checkout:' "$launcher"
fi

# The run that decides it. A private home so nothing reaches the real one.
BOT_HOME="$scratch/home" "$launcher" --help >"$scratch/help.out" 2>&1 ||
	fail 'launcher --help exited nonzero:' "$scratch/help.out"

if ! grep -q '^usage: bot ' "$scratch/help.out"; then
	fail 'launcher --help printed no usage:' "$scratch/help.out"
fi

# The scratch bindir is never on PATH, so the warning always fires here — and
# the advice under it has to name the directory just installed into, in a line
# that survives being pasted into a shell profile verbatim.
advice="  export PATH=\"$bindir:\$PATH\""
if ! grep -qF "$advice" "$scratch/install.out"; then
	fail "install advises a PATH line that is not [$advice]:" "$scratch/install.out"
fi
if grep -qF '.local/bin' "$scratch/install.out"; then
	fail 'install names .local/bin though it installed somewhere else:' "$scratch/install.out"
fi

# uninstall interpolates the same paths; make it prove it can find its own file.
make -C "$checkout" uninstall BINDIR="$bindir" >"$scratch/uninstall.out" 2>&1 ||
	fail 'make uninstall failed:' "$scratch/uninstall.out"

if [ -e "$launcher" ]; then
	fail 'make uninstall reported success but left the launcher behind:' "$scratch/uninstall.out"
fi

echo 'installcheck: installed from a path with a space, ran, and uninstalled.'
