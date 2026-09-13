---
base: a47afc6766b76147032736ddc6735f476e3025ec
head: b27df3544f1a54293e1c38a8b7af38542ec89797
---

# Drop the find recount

Removed the redundant post-refresh recount and its drift diagnostic. Find now trusts change-based refresh while retaining schema rebuilds, query results, and other index diagnostics.
