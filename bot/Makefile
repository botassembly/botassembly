.PHONY: check lint catch-budget typecheck test knip cycles ratchet pinned-deps install fuzz

check: lint catch-budget typecheck test knip cycles ratchet pinned-deps

# Ticket 0011: a wider deterministic seed sweep than the bounded run inside
# `make check` (same committed seed; FUZZ_CASES only extends the case list).
fuzz:
	FUZZ_CASES=2000 npm run test -- tests/fuzz-reader.test.ts

# `npm ci`, not `npm install` (ticket 0158): ci installs exactly what the
# lockfile pins and touches it never — the same promise check:pinned-deps
# gates on. Every document now points at this one target.
install:
	npm ci

lint:
	npm run lint

catch-budget:
	npm run check:catch-budget

typecheck:
	npm run typecheck

test:
	npm run test:coverage

knip:
	npm run knip

cycles:
	npm run cycles

# The ceiling lives in the repo root's sdlc/ratchet.json, read by the same script
# every factory repo uses. It resolves the repo from its own location, so it is
# correct from this subdirectory.
ratchet:
	npm run ratchet

pinned-deps:
	npm run check:pinned-deps
