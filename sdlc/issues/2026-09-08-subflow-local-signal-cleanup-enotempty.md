# Subflow-local-signal cleanup can fail with ENOTEMPTY

One complete offline check reported an `ENOTEMPTY` failure while `bot/tests/subflow-local-signal.test.ts` cleaned up its temporary state. A focused run of the affected checks passed 3/3. A later complete run passed all 1,408 runtime tests.

The evidence shows an intermittent cleanup or concurrency sighting. It does not establish a production defect or explain the cause. Promote it earlier if the cause becomes known or another occurrence appears. Close it on 2026-10-08 if it does not recur.

## Disposition (2026-09-12)

Status: retained intermittent observation. No production defect is established.
Review on 2026-10-08, or promote after another occurrence or a deterministic cause.
