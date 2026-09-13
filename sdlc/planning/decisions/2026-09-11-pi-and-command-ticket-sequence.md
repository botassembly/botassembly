# Pi and command ticket sequence

Decided 2026-09-11. Ian asked for the remaining Bot tickets to be consolidated, split, and ordered for efficient subagent SDLC execution. Three independent Sol Medium reviews inspected the session and package work, model and authentication work, and command backlog against clean `main` at `77d59d0`.

## Decision

Split draft 0250 into logical decoding, pagination, and search indexing. Keep the 0.85.1 package migration separate. Keep model availability and authentication separate because they own different trust and durable-state boundaries.

Split draft 0246 into assembly reads, model listing, authentication listing, assembly creation, assembly update, assembly removal, authentication login, authentication logout, and old-store import. Narrow 0247 to in-repository caller migration and ledger evidence. Keep 0217 as the held atomic deletion.

Run complete gates at five integration boundaries: the three reader tickets, the package migration, model availability, authentication, and the command batch. Each ticket keeps a separate design, implementation commit, code review, and completion record. No ticket completes before its batch passes local and hosted checks.

The format-4 decoder, exact intra-transaction cursor, private renderer, and cache indexing add 107 nonblank production lines. The ceiling moves from 16,852 to 16,959 after the integrated reader review. The alternatives were to hide the increase by combining unrelated owners or to omit cursor and cache guarantees. Both alternatives would weaken the design. The accepted cost is a small permanent increase in reader code. Later contraction can lower the ceiling only when it preserves the same behavior and proof.

- Starting production size: 16852 nonblank lines
- Ending production size: 16959 nonblank lines
- Simpler approach tried: The first implementation kept physical-line pagination and tried to admit a complete transaction. Independent review rejected it because it broke the public message limit and mislabeled large transactions. A later attempt exported the existing renderer from the public session module. Independent review rejected that public API expansion.
- Why insufficient alternatives were rejected: Keeping one physical offset cannot resume inside a transaction without repeating or omitting entries. Keeping the old search parser omits new entries. Duplicating the renderer would create two formatting rules.
- Production code deleted: 0 nonblank lines. The private renderer moves existing lines without deleting behavior.
- Accepted cost: 107 nonblank production lines for format-4 decoding, exact cursor recovery, one private shared renderer, exact skipped-entry accounting, and cache invalidation.

## Options weighed

1. Keep 0250 and 0246 whole. This would use fewer ticket records. Each review would mix independent failures and several risk levels. Rejected.
2. Split every command operation into its own ticket. This would isolate every change. Shared read and creation rules would repeat across many reviews and merges. Rejected.
3. Split at state and proof boundaries. Selected. The cost is ten additional draft records and integration ownership between them.

## Compatibility and trust rulings

Session cursors move to version 2 with a physical offset and logical ordinal. Readers continue accepting version 1 with ordinal zero. The search result contract stays at version 1. The private cache schema moves to version 3.

Pi's public session repository cannot create Bot's exact record-named filename. Ticket 0249 creates the exclusive format-4 header at that exact path and opens matching public metadata through `JsonlSessionRepo.open`. Pi owns every later transaction and native close. The cost is one Bot-owned header encoder tied to the exact-pinned format version. A public exact-path create API can replace it later.

Pi model configuration remains trusted operator input under ADR 0030. An owner-controlled symlink is valid when its resolved target is a regular file owned by the current user and is not world-writable. This preserves the current local Pi setup. The accepted cost is no protection from the same account, an owner-controlled group, or a path race. Bot makes no sandbox claim.

Authentication keeps a stricter boundary. Existing directories and files must satisfy the owner, mode, regular-file, and no-symlink rules in ticket 0245. The one-time old-store import may use a Bot-owned locked atomic copy because Pi exposes no public arbitrary credential-import API. Import succeeds only into a missing or valid empty destination. The accepted cost is manual resolution when Pi already holds credentials.

Legacy flat-only commands remain available until their current callers gain replacements or durable retirement decisions. The accepted cost is a longer-lived duplicate command surface. This avoids removing session inspection that the ideal state still promises.

## Model routing

Sol Medium designs and reviews every ticket. Sol Medium implements 0250 through 0252, 0249, 0244, 0245, 0254 through 0260. Luna High implements 0246, 0253, and 0247. The ticket scores record the reasons. New evidence can raise or lower a route before implementation.

Ian can overturn the split, batching, trust boundary, migration refusal, or legacy hold through a planning edit. A change to the trust or deletion rulings requires review before implementation because it can expose credentials or stop callers.

## Size decision

The accepted command batch raises the exact production ceiling now. Deferring the raise would block the required accepted assembly, model, and authentication commands. Deleting held legacy code in this batch would risk current callers and violate the ticket 0217 hold. The recommendation therefore keeps both surfaces until caller migration supplies deletion evidence.

- Starting production size: 17200 nonblank lines
- Ending production size: 19660 nonblank lines
- Simpler approach tried: The batch reused shared descriptors, result renderers, Pi runtimes, locks, and command dispatch. Independent reviews removed duplicate boundaries and narrowed each command to its accepted contract. No further deletion preserves both current commands and held legacy callers.
- Why insufficient alternatives were rejected: Deferral blocks accepted required commands. Immediate legacy deletion risks callers before ticket 0247 proves their migration and contradicts ticket 0217's explicit hold.
- Production code deleted: 0 nonblank lines. The accepted batch adds current routes while the legacy surface remains held for measured deletion.
- Accepted cost: The exact ceiling rises by 2460 nonblank lines with no slack. Ticket 0247 migrates retained callers. Ticket 0217 later deletes the legacy surface and must lower the ceiling by the measured deletion. Those tickets are the reversal lever for this temporary duplicate surface.

## Integration review

The final integration review rejected one unused public export on `assemblyUpdateSelection`. The remediation keeps the helper internal. Knip owns the mechanical proof that no unused export remains. The command behavior and exact production count do not change. Independent re-review remains pending.

The full gate then rejected one stale legacy `--home` expectation and three direct coding-agent imports outside the audited runtime boundary. The remediation expects the accepted current assembly-creation error and keeps Pi runtime types plus typed credential-synchronization settlement behind `model-runtime.ts`. The list behavior, no-mutation proof, typed operation, provider and credential checks, and command results remain unchanged. Independent re-review remains pending.
