---
base: b38e1d459ab9179f802c1d013c9479ad4fe2d1c0
head: 1c5bc9742bc0d8a82da1f1979c2a8c9bd8cf21f6
---

Human-facing session and inspection readings now spell terminal control
characters in untrusted fields. Raw sessions, records, and JSON remain
byte- and data-compatible, so readers are safe without changing machines.
