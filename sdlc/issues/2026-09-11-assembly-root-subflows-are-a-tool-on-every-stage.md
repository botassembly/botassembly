# An assembly-root subflow becomes a callable tool on every stage, including after a fan-out

A fan-out assembly put its worker at `fan/subflows/worker`, the placement
`specification/elements/fanout.md` implies when it says `subflow` "names an in-scope subflow".
The fan-out ran the worker three times as planned. The *next* stage then called the same worker
three more times of its own accord:

```
12:44:29  fanout_done    02-fan/1     exit 0, success, peak concurrency 3
12:44:29  stage_start    03-gather/1  read alk.txt, braf.txt, tp53.txt
12:44:39  subflow_call   03-gather/1  call 1 to worker, depth 1, 7 bytes in, exit 0
12:44:39  subflow_call   03-gather/1  call 2 to worker, depth 1, 8 bytes in, exit 0
12:44:39  subflow_call   03-gather/1  call 3 to worker, depth 1, 8 bytes in, exit 0
```

`03-gather`'s instruction was "Read every file in $INPUT and write all their lines to $OUTPUT,
sorted alphabetically." It had no reason to call anything. It had the tool, so it used it.

This is the documented scoping rule working as specified — `skills.md` and `subflow.md` both say
assembly-root scope means every stage — and it is still a trap. Nothing in `fanout.md` warns
that the worker it tells you to name will also be handed to the successor stage that
`fanout.md` requires you to place. The two rules are correct separately and expensive together:
the doubled calls are a large part of the 4.5x gap between the run's reported and actual spend.

The narrower placement (`flows/f/02-fan/subflows/worker`, or a stage-scoped one) is not
reachable, because a fan-out folder "holds only `FANOUT.md` and optional `README.md`".
