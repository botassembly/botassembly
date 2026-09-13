---
base: cbd001c8241101ca552d9373b2b92f728969f5b5
head: 0e6b9f6faccdc35e437e4b3b8c2c98eb8a426663
---

# Add a current complete-record reader

`bot run events RUN` now reads a complete root record or one authorized child record. Human output preserves the prior full reading. JSON returns one bounded `bot.run.events` version-1 document. `bot run record --raw` remains the exact root-byte reader. The command does not contact a provider and does not add live following.

The current adapter validates the complete request before home access. It separates missing selections, malformed requests, cursor-free integrity faults, filesystem faults, and output faults through the common current-command errors. Parent and child records must agree. Human and JSON results receive a complete size preflight before output.

Independent review found a filesystem fault that looked like a missing run, missing command-level boundary tests, a false no-provider test, absent child human parity proof, one stale example, and inaccurate interleaved size evidence. The repairs distinguish absent storage from invalid storage, exercise a successful isolated read, compare child human output byte for byte, and record the isolated 169-line production cost.

The shared local check passed 117 repository tests, 1,809 runtime tests across 237 files, 143 conformance cases, and every static gate. Coverage reported 91.29% statements, 84.78% branches, 93.71% functions, and 96.48% lines. GitHub Actions runtime run `34666114199` and documentation run `34666114089` passed on the published head.
