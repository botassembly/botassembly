---
base: 0a397db292f234fa9f16630a530a2147929d635a
head: 23b2c1a03b9539b16afe799e2cc572f188f8f014
---

Landed terminal record sealing for controlled run faults. Stage setup and
harness failures now retain their active stage and reason, while successful
output is read before publication and existing signal and subflow behavior
remains intact.
