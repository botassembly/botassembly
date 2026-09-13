---
base: ee9901089c0aef9ec884af5982ad5b3505132620
head: a81a1803db33fa82a1f0b4b8e750806c1629dd65
---

Assemblies now accept a positive temporary-storage ceiling, defaulting to one
GiB. The runtime samples each live stage's backing $TMP and faults the run
with the measured size and ceiling when the limit is exceeded.
