---
flow: build
priority: 8
---
Capture classifies assembly entries during walkAssembly
(bot/src/record.ts:92) and later re-resolves each pathname with
copyFile (bot/src/record.ts:127). Between those two moments the
filesystem can change. The 2026-08-09 outside review proved it with
a probe: after enumeration, a regular file was replaced with a
symlink pointing outside the tree; capture succeeded and stored the
outside bytes as a regular file. That bypasses the promised symlink
refusal, and it means the sealed assembly — the run's evidence of
what executed — may not be the tree that was inspected.

The behavior wanted: open each entry with no-follow semantics,
verify the opened object is a regular file, and copy and hash from
that same descriptor, so classification, copy, and hash all describe
one object. A swap after open changes nothing; a swap before open is
refused by the no-follow open.

Two lessons from the first flight's code-review refusal, which was
correct on both counts and must shape the next attempt:

- Protection must hold against a swap of ANY path component, not
  just the leaf. The first implementation used O_NOFOLLOW on the
  final component only, and the reviewer's probe swapped a PARENT
  directory for a symlink at the capture pause seam and still
  captured outside bytes. The second flight refused correctly for
  the opposite reason: the ticket then demanded an openat-style
  component-wise walk, and Node 22's public filesystem API has no
  dirfd-relative opens, so that design is impossible here. The
  achievable mechanism, which this ticket now requires, is identity
  pinning: record each entry's device and inode (from lstat) during
  enumeration in walkAssembly; at capture time open the path with
  O_NOFOLLOW, fstat the OPEN DESCRIPTOR, and refuse unless it is a
  regular file whose device and inode match the enumerated record;
  then read, hash, and copy from that same descriptor. A leaf
  swapped for a symlink fails the no-follow open; a swapped parent
  directory resolves to a different inode and fails the identity
  match. A hard link to the same inode passes, and that is correct —
  the sealed bytes are still the exact object that was inspected.
- The existing capture tests pin the current copyFile mechanism
  (bot/tests/run-capture.test.ts asserts the syscall). Changing
  those assertions is part of what this ticket changes and is
  authorized — but per the traceability rule it must happen in a
  design or design-review commit that states the new pinned
  behavior, never inside the implementation commit.

Test with the deterministic identity/type-swap regressions the
review names, now two of them: swap a regular file for a symlink
mid-capture, and swap a parent directory for a symlink mid-capture;
assert refusal for both. The existing byte-mutation tests stay;
they cover a different axis.
