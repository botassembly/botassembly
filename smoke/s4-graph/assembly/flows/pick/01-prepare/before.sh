#!/bin/sh
# A before hook changes things by writing files (hooks.md): what the agent
# reads is not what the caller sent. The marker is fixed in this fixture —
# distinctness is what matters for a canary that rides a file, not surprise.
set -e
printf 'PRIMED-MARKER-9F2C\n' >"$TMP/primed"
cat "$INPUT/request.txt" >>"$TMP/primed"
mv "$TMP/primed" "$INPUT/request.txt"
