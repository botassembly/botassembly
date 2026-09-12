---
base: 715f43e7b1efeb5b0f3d5aa5654f330952738f98
head: 7a65c7d892aa696e18c4106f180e10fb2ba40386
---

# Close the Bot and Pi availability mismatch

Bot now uses Pi's public ModelRuntime for provider, model, availability, and authentication behavior. Locally configured Pi models appear through the same runtime that starts and resumes work. Bot no longer copies Pi's catalog or uses a separate live credential store.

Tickets 0243, 0250 through 0252, 0249, 0244, and 0245 preserve the split implementation and review evidence. Ticket 0260 preserves the one old-store migration exception. Archived ticket 0231 keeps the original 40-provider, 1,356-model, 134-versus-112 availability measurement as historical evidence.

Independent closure review mapped every original fact and required outcome to ADR 0030, the focused completion records, current source, and tests. The reviewer ran 45 focused tests under Node 22.22.3. All passed. No product work remains in this evidence ticket.
