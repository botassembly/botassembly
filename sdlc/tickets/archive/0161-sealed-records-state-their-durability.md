---
flow: build
priority: 6
---
# Sealed records state their durability

No fsync or fdatasync call exists anywhere in bot/src (verified by grep at d0224ce). `record.md:45-53` promises a killed run stays readable up to the kill and tolerates a torn last line — that holds for process death, and does not hold for power loss. The 0.1 specification freeze needs the durability promise stated either way, and today it is unstated.

## The ruling (Ian, 2026-08-27)

Fsync at seal. One sync when `run_end` is written makes a sealed record power-loss durable. Mid-run events keep the weaker promise: readable up to a process kill, and a power loss may lose an unsealed tail. The seal is the product's claim that the record is complete, so that one write is the one worth making durable, and the spec states the two-tier promise exactly.

The alternative — documenting process-crash durability only, with no code change — was considered and rejected: it leaves the spec's strongest sentence ("a sealed record is complete") carrying a permanent qualification.

## Done, observably

- record.md states the two-tier durability promise exactly: sealed records survive power loss, unsealed tails may not.
- Sealing performs the sync, a test proves the call, and a failed sync surfaces as loudly as a failed append under ticket 0151.
- A CHANGELOG entry records the ruling.

## Boundary

Whichever option lands, mid-run append behavior stays as ticket 0151 defines it. No batching, no periodic sync, no configuration knob.
