# `FANOUT.md`

> **Stability: provisional.**

This control may change in a later pre-1.0 release.

A fan-out runs one authored subflow for every item in a checked JSON list. Bot derives the complete work set from the immediately preceding stage. The producing agent does not call the subflow itself.

`FANOUT.md` is a numbered folder in the root sequence of a named entry flow. One ordinary JSON stage must precede it. One ordinary stage must follow it. A fan-out cannot be first, last, nested, or placed in a subflow. Its folder holds only `FANOUT.md` and optional `README.md`.

```yaml
items: jobs
subflow: worker
width: 2
max-items: 16
```

The sentinel has no body and exactly these four keys. `items` names a top-level array in the preceding JSON object. `subflow` names an in-scope subflow whose final node is an ordinary stage. `width` limits concurrent children. The bounds satisfy `1 <= width <= max-items <= 32`.

Each array entry has exactly `id` and `input`. An id matches `[a-z0-9][a-z0-9_-]{0,127}` and is unique. An input is a JSON object. Bot refuses an empty list, malformed JSON or UTF-8, a document above 1 MiB, or any invalid entry before it starts a child.

Bot sorts items by the UTF-8 bytes of their ids and invokes the selected subflow once per item. Each child request is compact JSON for `{id,input}`. At most `width` children run at once. An ordinary child failure or machinery fault does not stop siblings. An outside signal stops new launches and settles started children.

Fan-out succeeds only when every child succeeds with one sealed output from the selected subflow's final root stage. Bot opens each accepted output once and fixes its descriptor and initial size. The next stage receives that held snapshot as one `<id>.<extension>` input for every item. A path replacement cannot redirect the copy, an append is not chased, and a partial or hash-disagreeing copy is removed before the successor starts. The output has no inspection-size limit. A failed fan-out never passes a partial set. Resume runs the whole fan-out again from the retained predecessor output.

The parent record binds the retained manifest and sorted plan in `fanout_start`, records one sorted `subflow_call` disposition per item with `via: "fanout"`, then writes `fanout_done`. Child records keep the existing subflow layout. Completion timing never controls row order or aggregate failure selection. The record keeps shape 1 because the new events and fields are additive.
