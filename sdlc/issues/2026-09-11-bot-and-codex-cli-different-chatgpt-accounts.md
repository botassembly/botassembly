# bot and the Codex CLI sign in to different ChatGPT accounts, so a quota fault misleads

Observed 2026-09-11 while trying to run a nine-stage assembly on `openai-codex`.

`bot run` faulted with `Codex error: The usage limit has been reached` on one model. One minute earlier and one minute later, `pi` with the same provider and model answered normally, as did a sibling model. The same failure had appeared earlier on two other models, and it persisted after re-authenticating the Codex CLI, which led to the wrong conclusion that the ceiling sat on the account.

The two tools hold different credentials for the same provider:

| credential source | account | plan | token state |
| --- | --- | --- | --- |
| Bot's credential store | account A | pro | current |
| Codex CLI credential store, which Pi reads | account B | pro | current |

Both tokens are current. The account ids differ. bot's account is over its limit; the other is not. Re-authenticating the Codex CLI refreshes only the second file, so it can never clear a fault coming from the first.

The error text names a usage limit, so the obvious response is to wait or re-authenticate. Neither works, because the fault is an identity mismatch wearing a quota error's clothes. A run faults, the model looks unavailable, and the operator reasons about the wrong subsystem. Two separate sessions here reached the wrong diagnosis and recorded it in a config comment.

`bot auth` already prints where each credential comes from. It does not print who the credential is. Adding the account or workspace identity to that listing would have made the divergence visible in one command.

## A second defect

`bot auth import <file>` documents itself as copying logins from another agent's credential file into bot's. Pointed at the Codex CLI's own file it refuses:

```
request-invalid  <codex-auth-file>
  Credential for auth_mode in <codex-auth-file> is not a pi-ai credential shape.
```

It accepts only pi's shape. The message also reveals that it iterates the file's top-level keys as provider names, so `auth_mode` is read as a provider. The Codex CLI's file is the most likely thing an operator points this verb at, and logging in interactively needs a terminal and a browser, which a background or headless run does not have.

The experiment copied the Codex CLI credential into Bot's expected fields by hand. `bot run` then drove the model correctly, wrote into the shared working directory, and returned. The repository does not retain the credential, account identifiers, private paths, or token times.

## Suggested fixes, in order of value

1. Print the account or workspace identity in `bot auth` listings, so two tools disagreeing is visible without decoding a JWT.
2. Teach `bot auth import` the Codex CLI's `auth.json` shape, and ignore non-provider top-level keys instead of failing on them.
3. Carry the provider's own error text but prefix it with the identity bot used, so a quota fault says which account hit the quota.

## Evidence

- Probe assembly and its two runs, before and after the credential swap: the first faulted, the second wrote a file into the shared working directory and returned ready.
- The private experiment retained its original credential backup outside this repository.

## Disposition (2026-09-12)

Finding 1, exposing provider account or workspace identity in `bot auth list`,
is a retained later opportunity. Review when an operator needs identity
diagnostics or on 2026-12-12.

Finding 2, importing the Codex CLI credential shape, is a retained later
opportunity. Review when a supported cross-tool import is requested or on
2026-12-12. Neither finding blocks the source alpha; credentials remain local
and no credential values belong in this ledger.
