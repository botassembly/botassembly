---
base: e803e797b8394df70398b3ea35f27bff48bedaba
head: 97a3e3853da8d47e52e05fa29118ed419e9264de
---

# Use Pi as the shared credential source

Bot now uses Pi's supported authentication store and public runtime APIs. The default store is `~/.pi/agent/auth.json`, and a configured Pi agent directory moves the same file without creating a second Bot-owned source. Run, resume, models, login, logout, and authentication listing share this source. Supported environment credentials remain available.

Bot validates existing Pi authentication paths before it opens them. The agent directory must be a real owner-controlled directory with mode `0700`. The authentication file must be a real owner-controlled file with mode `0600`. Missing paths remain valid because Pi creates them. Unsafe, unreadable, or corrupt paths fail before provider contact or credential mutation.

The retired Bot credential file no longer authenticates work. Bot only checks whether an entry remains at that path. The affected commands warn once after command validation and before authentication begins. Bot never opens, changes, locks, moves, truncates, or deletes the retired entry in this ticket. The old import spelling refuses before reading either store. Ticket 0260 owns the narrow migration exception.

Independent design review rejected the first design because it did not define the transition gap, warning boundary, import refusal, or rollback proof. The accepted design names all nine warning surfaces and the surfaces that stay silent. It preserves the retired file byte for byte so an operator can roll back. Independent code review then required exact registration-refresh waiting, real run and resume contention tests, typed lock evidence, a single Pi runtime import boundary, and a lower production-size ceiling. The final review accepted those repairs.

The website changed while the ticket was in review. The rebase kept the new short reference pages and retained the full contract in the specification and CLI help. Mechanical tests now require exact section links from the short pages. Independent review confirmed that this preserves the contract without copying it across pages.

The final local check passed 113 repository checks, 143 conformance checks, and 1,619 runtime tests across 224 files. Coverage reached 92.17 percent of statements, 86.00 percent of branches, 94.07 percent of functions, and 97.14 percent of lines. GitHub Actions documentation run `34635122237` passed on the published implementation commit. The first hosted runtime run correctly rejected three direct test fixtures that inherited public file permissions on GitHub. The fixtures now create Pi authentication files with mode `0600`. Independent review accepted the exact three-line repair, and hosted runtime run `34635640427` passed on the final head.
