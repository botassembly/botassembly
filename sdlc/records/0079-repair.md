---
base: 53f94e4d35e950e7058412d78d4cb23b5e7c218c
head: 8efa9efb64c7f370e3907bfea7d5b63f42c4c694
---

Install treated a hyphen-prefixed `--name` value as an assembly name and
silently used the default name when `--name` had no value. It now refuses
both malformed forms and covers them alongside a valid named install.
