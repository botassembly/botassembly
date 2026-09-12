# The ticket checklist — certified on every ticket

Every ticket's builder certifies each item when the work is done, in its
final report, with a sentence of evidence per item — not a bare yes. The
auditor re-checks the ones the diff touches. An item that cannot be
certified honestly is reported as a finding, never papered over. Items
1–9 are Ian's; 10–15 extend them from the project's standing doctrine.

1. **File over app.** Everything durable is a file a person can open:
   assemblies are folders, runs are directories, the record is JSONL,
   outputs are files on disk. No state lives only inside a process.
2. **Simplicity / least surprise.** The obvious guess is the rule; it
   does the obvious thing. No cleverness, no speculative abstraction, no
   configuration where a convention serves.
3. **POSIX.** Exit codes mean what the shell expects (0/1/2, 128+n),
   signals are honored, process groups are used, env vars pass through,
   paths and name ordering are bytewise — a shell user is never surprised.
4. **Composability.** Outputs land at knowable disk paths so the next
   thing — a stage, a flow, a human, a script — can chain from them.
   Nothing consumes what it cannot also leave behind for others.
5. **Push code down to Pi.** Never replicate what Pi does; use its
   public API, and when the needed thing is private, file the upstream
   ask and glue minimally with an `// upstream:` marker. New capability
   in our tree that Pi half-owns is a design smell.
6. **Least code that safely does the work.** No overly-safe code: no
   defensive catch, no wrapper types, no just-in-case parameters. The
   budget (ratchet, max-lines) is the mechanical form of this promise.
7. **Red-green.** The failing test exists before the code that passes
   it — the corpus case, the golden file, the unit test. A ticket's
   report names which tests were red first.
8. **Maintainability.** Modules mirror spec element names; a stranger
   with the spec open can find the code. Comments state constraints the
   code can't show, nothing else.
9. **No duplication.** One extractor, one serializer, one vocabulary —
   a fact lives in one place and is imported everywhere else. Runtime
   re-statements of spine unions count as duplication.
10. **The spec is the authority; the corpus proves it.** Every behavior
    traces to a spec passage. A disagreement between code and spec is a
    finding (the spec may be wrong — say so), never a silent adaptation.
    New reader refusals get corpus cases; management refusals get
    byte-exact test pins instead (invariant 50 as scoped by Ian,
    2026-08-05 — refusals.md "Managing the home").
11. **The record never lies.** New runtime facts get record events;
    absence means the thing never existed; nothing claims more than
    happened. Sealed bytes are judged bytes.
12. **Explicit over ambient.** Clock, env, identity, writer — passed as
    arguments, never reached for. The doctrine lint rules enforce the
    letter; the ticket certifies the spirit (no smuggling via config
    objects or singletons).
13. **Gate integrity.** `make check` green without weakening anything;
    new rules are demonstrated to fire; allowlist entries carry written
    justifications; no inline disables.
14. **Boundary hygiene.** Pi public API only, zero deep imports; casts
    and catches confined to designated boundary files; no `~/.pi`
    paths; no new dependencies without an ADR.
15. **Honest reporting.** The final report states what was NOT done,
    what was interpreted (with the interpretation), and what a reviewer
    should look at hardest. A claim without an artifact is not a claim.
16. **Cache discipline.** No prompt churn: everything shown to a model
    keeps a byte-stable ordering across rounds, volatile content (dates,
    counters, per-round facts) sits at the very end of the setup — and
    is included at all only when necessary and desired. Any change to
    prompt-adjacent code certifies the stable prefix survived (the
    golden prefix-stability tests are the mechanical form; ADR 0012 is
    the doctrine).
17. **Do not promise behavior you do not test.** If a ticket adds or
    changes a sentence in `specification/` that promises a runtime will
    do something, the test or corpus case that would fail if the runtime
    stopped doing it lands in the same commit — or the report names the
    sentence as UNWITNESSED in so many words. Added 2026-08-03 after the
    same trap was walked into twice in three tickets: 0054's "repeats are
    counted apart" and 0057's "a chooser does not read its own folder's
    skills" were both written with nothing to falsify them, and both were
    caught by accident rather than by process. An unwitnessed promise is
    how a specification starts lying.

    **This governs promises, not prose.** Rewritten 2026-08-05 by ticket
    0109, because it was being applied as *every sentence is
    load-bearing*, and that reading damaged a chapter twice. Revision 10
    dropped an accurate clause from `inspection.md`'s definition of
    `unreadable` for the sole reason that no test covered it — a 512 MB
    file is not a fixture any suite should build — and the clause had
    been the exception holding up a universal, which became false the
    moment it left. Revision 11 then spent a whole ticket making the
    paragraph true again, and did it by hedging until a reader could
    derive almost nothing from it. A sentence that cannot be tested is
    not a sentence that must not be written. Explanation, motivation,
    worked examples and restatement carry no witness and need none. Ask
    whether a runtime could stop honoring the sentence: if it could not,
    there is nothing to witness; if it could, witness it or say
    UNWITNESSED out loud.
