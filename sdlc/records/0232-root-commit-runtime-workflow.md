---
base: 43e4e5ee1f641251c98047dbe22dd0fe412c43ea
head: b7e2d221ccfa3658b590484f6d9bf912e216ff58
---

# Accept a root commit in the runtime workflow

The runtime workflow now reads the raw `HEAD` commit header. A true root passes. A non-root commit must have its parent locally. Synthetic tests cover a root, a hidden shallow parent, an exposed parent, and a failed commit inspection. Local `make check` passed with 70 repository tests and 1,524 runtime tests. GitHub Actions run `34523671982` passed on `main`.
