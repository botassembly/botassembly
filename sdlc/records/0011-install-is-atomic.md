---
base: d27458b211e49b50ac88d865b42d7f1a566da669
head: 27b30864cf36c5495c4c641a9d69d0ab77d35d39
---

Landed atomic assembly install publication: copies and provenance are staged beside the requested name, then published with a rename, so ordinary failures leave no partial target.

A SIGKILL process test proves the install invariant; the existing update swap keeps its old-or-new whole-tree behavior. Two unrelated recovery and provenance findings are recorded as issues.
