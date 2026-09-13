#!/bin/sh
# The failure hook's two extra slots (hooks.md): the cause word, and the path
# to the text behind it. Both are printed so the record keeps what it saw.
printf 'cause=%s\n' "$CAUSE"
if [ -n "${REASON:-}" ] && [ -r "$REASON" ]; then
	printf 'reason-readable=yes\n'
else
	printf 'reason-readable=no\n'
fi
exit 0
