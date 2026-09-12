---
base: 858c75348116009be898d680c9a7ff31533fc505
head: cadceb04e31c3b2a2bdb296c72e2f543530342b5
---

# An assembly declares its extra folders

Assemblies can declare opaque top-level folders or disable strict unknown-root
checks while keeping strict behavior as the default. Opaque contents stay out
of validation, capture, execution, and procedure identity, so assemblies can
carry data that is not bot's business.
