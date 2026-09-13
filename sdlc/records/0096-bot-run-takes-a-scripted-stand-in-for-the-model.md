---
base: 8386114d228de8ea91cbecd8e8f0e36ca5986d72
head: 47eb05ec6b89197c871d6a5832992661f210dbb2
---

Landed `bot run --script FILE`, which drives a flow from JSON assistant
responses without live credentials. Scripted runs use the assembly's model
identity and mark `run_start` provenance with `model_source: "scripted"`, so
the record cannot present them as live runs. Missing script values refuse
plainly, and `resume` continues to reject the run-only option.
