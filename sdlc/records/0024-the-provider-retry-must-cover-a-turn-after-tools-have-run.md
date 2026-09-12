---
base: 00f48fac8b32542abeeed50f7b94c65e66eac6ba
head: e0dc3ec5e5c6513be40f0c98ac1312275a10be72
---

Landed bounded provider-stream retries for retryable, zero-usage failures at the call seam, including calls after tools and multiple blips in one stage. The retry context records every scheduled attempt while preserving terminal fault causes and never replaying a completed prompt or retrying token-spending failures.

Focused coverage proves retries after one tool side effect, repeated retries, token-spending refusal, and exhausted-retry fault reporting. The source ratchet accounts for the authorized 44-line implementation.
