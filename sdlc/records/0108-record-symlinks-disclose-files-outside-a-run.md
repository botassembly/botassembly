---
base: 3eb60fb1df1ee90d1bad9d591d4f75b0d8dc909c
head: 4f647a997c2760d20569d641542dd21cddb82e6a
---

Inspection now validates every record-controlled path component and holds the
validated regular file through its read. This refuses symlink traversal and
replacement races without changing healthy byte-exact reads.
