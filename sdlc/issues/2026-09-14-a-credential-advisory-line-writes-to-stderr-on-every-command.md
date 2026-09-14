# A credential advisory line writes to stderr on every command

Observed 2026-09-14 on the Linux box.

`bot/src/cli.ts` around line 150 writes "The retired Bot credential store is inactive; this command uses Pi's auth.json." to stderr whenever `~/.config/bot/credentials.json` exists on disk, once per process, on the first command that touches credentials. This fires on every command, a successful run start included, guarded only by whether that file exists.

The documented promise is that a successful command writes nothing to stderr. A caller that treats any stderr output as a fault signal rejects a well-formed, successful result because of this one line. `sdlc/planning/notes/2026-09-14-review-docs-site.md:129-131` already records that this line contradicts that same promise on the docs site (`guides/first-assembly.md:154`, `guides/install-and-use.md:137`), as a documentation accuracy problem. This issue is the code side: the line itself should not be on stderr for a successful command, not just the docs describing it.

Smallest outcome that closes it: either stop writing this advisory to stderr on a successful command, or make the retired-credential-store check obsolete so the guard has nothing left to warn about.
