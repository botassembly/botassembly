---
base: fd853ee4816b2b9c6074ffc887cffdbcb8a056db
head: 2c8bc98ea1bbbe72897a751f5e803a1881321e78
---

Record reads now normalize through an explicit migration chain before
inspection uses them. The frozen v1 corpus preserves raw JSONL and proves
current output, while unsupported versions are refused by name.
