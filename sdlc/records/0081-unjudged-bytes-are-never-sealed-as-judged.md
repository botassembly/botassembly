---
base: 1548d9112981e77f4cb893f2721fd639315c0342
head: b051a8019fc48c60975948efd73aa27033cf4578
---

Exhausted failed checks now retain the final candidate that was actually
judged. Later output mutation is recorded as hash drift, so sealed records
never claim judgment of unseen bytes.
