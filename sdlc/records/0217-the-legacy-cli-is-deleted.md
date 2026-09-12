---
base: 169b08e47f6348da3c9eae07d03aad0ff00bfae7
head: a0a44dfe8fccf8154323331e4add889dc9cb1ea5
---

# Delete the legacy CLI

Bot now exposes one command surface. The implementation removed every flat legacy route, six bridge-only modules, old parsers, old help, stale specifications, and old-only tests. Production source fell from 19,991 to 18,086 nonblank TypeScript lines. The 1,905-line reduction exceeds the conservative 778-line deletion floor.

The current surface keeps all 25 descriptors and routes plus four public reader exports. Current commands retain start, resume, output, record, request, check, checklist, events, session, list, home, assembly, authentication, and model behavior. Unknown old commands fail before home, provider, credential, or runtime access.

The permanent maintained-source guard rejects every statically literal retired form in command-position shell text and direct or assigned JavaScript argument arrays. Its shell boundary accepts larger words such as `my-bot runs` and `other.bot runs`. Argument arrays built through mutation, spread, computation, or variable flow remain outside lexical analysis. Runtime unknown-command tests protect behavior at that boundary.

The final replacement table is:

| Retired command | Current command |
| --- | --- |
| `bot run TARGET` | `bot run start TARGET` |
| `bot resume` | `bot run resume` |
| `bot check` | `bot assembly check` |
| `bot runs` | `bot run list` |
| `bot show` for complete or child events | `bot run events` |
| `bot show --raw` | `bot run record --raw` |
| `bot show --check` | `bot run check` |
| `bot output` | `bot run output` |
| `bot request` | `bot run request` |
| `bot session` | `bot run session` |
| `bot busy` | `bot home busy` |
| `bot models` | `bot model list` |
| bare `bot assembly` | `bot assembly list` |
| bare `bot auth` | `bot auth list` |

The project retired `draft`, `rejected`, `capture`, `logs`, `explain`, `find`, `status`, `prune`, and `config` without replacements. The final external audit found that the current dispatcher uses only `capabilities --json`, `home show --json`, and `run start --json`. Archived sources remain history and did not justify compatibility commands.

Independent review rejected the first four implementation revisions. The reviews found stale active instructions, incomplete shell and JavaScript scanning, false test witnesses, lost scratch isolation proof, dead parsing, untested adapters, missed shell forms, and false positives for larger words. The accepted revision restores the unique behavior proofs and pins 25 direct lexical cases.

The complete local check passed 117 repository and documentation tests, 1,523 runtime tests across 199 files, 143 conformance cases, every static gate, and the production-size ratchet. Coverage reported 84.87% statements, 77.74% branches, 87.16% functions, and 90.02% lines. GitHub Actions runtime run `34678191235` and documentation run `34678191250` passed on the published head.
