---
base: c065c8521bf0b82c72f91f846b8c8ceff5ccd9a8
head: ac3bfd21e8449d3533c2562ab81c55002acfb673
---

# A named live listing contacts only its named provider

Named live model listings now isolate refresh work to the requested provider
and restore the full provider collection afterward. Unqualified live listings
still refresh every configured provider, preserving their existing meaning.
