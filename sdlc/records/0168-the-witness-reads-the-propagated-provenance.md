---
base: f48b28a3a69dcd2ae610e5e3b26e232018b10f8a
head: 02bfe053d16cf90ed53e365fba91670eba0bf9a5
---

The lifecycle adoption witness now reads each script digest and executable bit
from the propagated provenance manifest. It still rejects local script forks,
while coordinated script and manifest propagation passes without a local
witness update.
