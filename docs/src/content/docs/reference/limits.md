---
title: "Limits and cost"
description: "What bounds a run and what does not: the stage timeout, the width of concurrency, and the absence of any run-wide deadline, budget, or disk cap."
sidebar:
  order: 9
---

*This page describes what the `bot` runtime bounds during a run and what it leaves unbounded — an implementation reference, not part of the runtime-agnostic format specification.*

## Nothing bounds a run as a whole

No deadline, no cost budget, no disk quota. `timeout` bounds a stage's agent, and each gate and hook gets a budget of the same size, but the run itself ends when its stages do. Supervising a long or expensive one is yours to do from outside.

This is worth knowing before unattended or batch work. A flow with a loop, a fan-out, or a large input can spend more than you meant it to, and bot will not stop it.

## What is bounded

| Bound | Where it is set | What it covers |
| ----- | --------------- | -------------- |
| `timeout` | the option ladder | one stage's agent, and each gate and hook |
| `retries` | the option ladder | send-backs before a stage is spent |
| `repeat` | `LOOP.md` | repeats before a loop is spent |
| `width` | `PARALLEL.md` and `FANOUT.md` | branches at once, at most 32 |
| `max-depth` | `DESCEND.md` | how deep a flow may call itself |

`timeout` and `retries` resolve per stage. Where each key resolves, and its defaults, is the format's rule: [options and where they resolve](/specification/running/#options-and-where-they-resolve).

## Reading what a run cost

A sealed record carries the token split per stage and for the run. `bot run events RUN` closes with what it cost, and `bot run list` prints tokens in its last column. That is after the fact, not a cap.

```sh
bot run list
bot run events RUN
```

See [Inspecting a run](/reference/inspection/).
