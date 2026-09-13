---
base: d8f909d07ba8abef87f00b2c42b04d30f4c1acff
head: f039eed64cacaa0ec56f889b757e7ddccd28928d
---

Fixed `bot runs` listing a live run before its `record.jsonl` existed, which
published null identity fields in JSON output. Live record-less directories are
now omitted until their record is readable, while dead record-less directories
remain `no-record`; documentation and regression tests cover both renderings.
