---
project: botassembly
date: 2026-09-11
status: unfolded
---

# Hands-on experiment, 2026-09-11

Forty model-backed stage runs across twenty records on a cheap flash model, about $0.21. The experiment folder and its twelve issue files live outside this repo in the operator's experiments workspace under `botassembly-unix-citizenship-2026-09-11/`; they are handed to the runtime team as a batch when the next round opens.

Verdicts: the first-assembly guide fails twice before any token is spent (home directory mode, retired catalog model), then works. Unix behavior is deliberate and correct except one stdin hang. One assembly exercising checklist, schema, gate, exit 75, hooks, a skill, and CHOOSE worked first time. `bot check` refuses every bad container placement in under half a second with a repair line. `bot resume` matches its documentation.

Issue titles: new home must be 0700 and nothing says so; catalog offers a model the provider 404s; `bot run` blocks on stdin with a task-file argument; stage names promised on stderr never appear; `tail-container` refusal text is undocumented; run token total excludes subflow children; root subflow becomes a tool on every stage; `bot auth list` refused; run list ages read backwards; `bot run check` advertises a list mode it lacks; `bot run show -j` omits choice, gates, hooks, cost; `bot check` does not walk subflows.
