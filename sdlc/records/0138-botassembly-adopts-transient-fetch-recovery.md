---
base: 5215ee5572ab7cecdf3d7a88f246932a9860cb38
head: 10862673b49848fb411e558fdb34ab969a4aa6c9
---

# Botassembly adopts transient fetch recovery

Botassembly now carries the deployed canonical `tasks` script. A transient fetch failure gets one retry, while a final failure reports a bounded, sanitized diagnostic.
