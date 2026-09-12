---
title: "Development and Testing"
description: "How to run the offline gate, the live smoke ladder, and the packaging check, plus where the project stands on license and hosted checks."
sidebar:
  order: 1
---

## Who makes this

Bot Assembly is built by Ian Maurer. It is MIT-licensed
([LICENSE](https://github.com/botassembly/botassembly/blob/main/LICENSE)) and developed in the open at
[github.com/botassembly/botassembly](https://github.com/botassembly/botassembly).

## What the version promises

Version `0.0.1` is the first public alpha. The runtime, the specification, and the examples match
within this release. A later pre-1.0 release may change assembly and record contracts without a
migration, so an early user may need to update assemblies and may need the matching older runtime to
read an older record. Version 1.0 is the first promised cross-version compatibility boundary. No date
is set for it.


## The three checks, and when to run each

**The gate** is the everyday check: deterministic, offline, and free — it calls no model. It runs the full test suite, the entire conformance corpus against the reader, lint, a type check, dependency and cycle checks, and a size ratchet.

```sh
cd bot
make install   # once: pinned dependencies
make check     # the whole gate
```

**The smoke ladder** is the deliberate check: eleven live runs against a real model with real credentials, proving that real auth, a real clock, and a real provider still produce correct sealed records. It costs money, so it is never part of the gate and never runs by accident — bare `make` at the repository root prints help instead of spending.

```sh
make smoke           # the whole ladder, from the repository root
make smoke SMOKE=3   # one rung
```

**The packaging check** exercises `make install` itself — it installs the checkout from a scratch path whose name contains a space and runs the launcher it wrote. Run it after touching the root Makefile.

```sh
make installcheck
```

## What the hosted checks run

GitHub Actions runs `make check` on every push and every pull request, on Ubuntu with the pinned Node version. A second workflow builds this site and publishes it when a push to `main` changes anything under `docs/` or under `specification/`. The hosted gate calls the same script you call locally, so a green `make check` on your machine is the check the repository runs.

## Where work is tracked

Work lives in the repository itself: tickets in [`sdlc/tickets/`](https://github.com/botassembly/botassembly/tree/main/sdlc/tickets), one sealed record per landed ticket in `sdlc/records/`, decisions in `sdlc/planning/adr/`. A ticket is done when its record exists.
