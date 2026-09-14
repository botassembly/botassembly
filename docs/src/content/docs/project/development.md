---
title: "Development and testing"
description: "How to run the offline gate, the live smoke ladder, and the packaging check, and where the work is tracked."
---

Four checks guard this repository, and each one covers something different.

## Who makes this

Bot Assembly is built by Ian Maurer. It is MIT-licensed
([LICENSE](https://github.com/botassembly/botassembly/blob/main/LICENSE)) and developed in the open at
[github.com/botassembly/botassembly](https://github.com/botassembly/botassembly).

## The checks, and when to run each

**The gate** is the everyday check. It is deterministic, offline, and free, and it calls no model. It runs the full test suite, the entire conformance corpus against the reader, lint, a type check, dependency and cycle checks, and a size ratchet.

```sh
sh sdlc/scripts/install  # once, and after dependency changes
make check               # the whole gate
```

**The smoke ladder** is the deliberate check: eleven live runs against a real model with real credentials, proving that real auth, a real clock, and a real provider still produce correct sealed records. It costs money, so it is never part of the gate and never runs by accident. Bare `make` at the repository root prints help instead of spending.

```sh
make smoke           # the whole ladder, from the repository root
make smoke SMOKE=3   # one rung
```

**The packaging check** exercises `make install` itself. It installs the checkout from a scratch path whose name contains a space and runs the launcher it wrote. Run it after touching the root Makefile.

```sh
make installcheck
```

**The platform check** runs scratch installation, shipped-example resolution, and a narrow set of process, signal, lock, input, output, and cleanup tests. It accepts Linux and macOS only. It stays offline and never installs into your ordinary home.

```sh
make platformcheck
```

## What the hosted checks run

GitHub Actions keeps the complete Ubuntu `make check` job and also runs `make platformcheck` on Ubuntu and macOS with the pinned Node version. A second workflow builds this site and publishes it when a push to `main` changes anything under `docs/`, `specification/`, or `examples/`. Publication waits for both runtime jobs. Native Windows refuses before command work and directs operators to WSL.

## Where work is tracked

Work lives in the repository itself: tickets in [`sdlc/tickets/`](https://github.com/botassembly/botassembly/tree/main/sdlc/tickets), one sealed record per landed ticket in `sdlc/records/`, decisions in `sdlc/planning/adr/`. A ticket is done when its record exists.
