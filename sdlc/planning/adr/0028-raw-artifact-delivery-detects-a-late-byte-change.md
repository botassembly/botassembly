# ADR 0028 — Raw artifact delivery detects a late byte change

**Status:** accepted · **Date:** 2026-09-06 · **Ruled by:** Ian · **Supersedes:** the private verified-snapshot requirement for noun-based raw artifact delivery

## Context

Large noun-based output retrieval copies the selected file into private temporary storage, verifies the copy, and then streams it. This uses disk equal to the output and reads every byte three times. The private copy prevents a same-account process from changing delivered bytes after verification.

Bot runs as local software under one Unix account. Its records provide integrity evidence. They do not defend against a malicious process with the same filesystem authority. Raw delivery already permits partial stdout when a read or output failure begins after copying starts.

## Decision

Raw artifact delivery safely opens and holds the sealed file. The first bounded-memory pass fixes the descriptor's observed size and must match the recorded hash before stdout begins. The second pass streams that fixed extent and computes another hash. Path replacement cannot redirect the descriptor. An append cannot extend the fixed extent.

An in-place byte change between or during the passes may reach stdout. A changed second hash returns the integrity failure and never reports success. Callers must honor the exit status.

## Consequences

Delivery needs no output-sized temporary storage and one fewer full read. Bot detects a late same-account change but cannot retract bytes already written. A caller that ignores a nonzero exit can consume bytes that do not match the record.
