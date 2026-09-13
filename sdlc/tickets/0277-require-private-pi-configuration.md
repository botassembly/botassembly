---
flow: build
priority: 2
deps: []
---
# Require private Pi configuration

## Outcome

Before Bot asks Pi to load authentication or model configuration on a POSIX platform, each existing Pi path that the selected operation uses is private and owned by the effective user. `auth.json` and command-capable `models.json` are real regular files with mode `0600`; the containing agent directory is a real directory with mode `0700`. Missing files remain valid. Bot keeps Pi's supported configuration behavior and ordinary agent tools, and it makes no containment claim.

## Current facts

- Bot already requires an existing Pi agent directory to be a real directory with exact mode `0700` and an owner equal to `process.getuid()`.
- Bot already requires an existing `auth.json` to be a real regular file with exact mode `0600`, an owner equal to `process.getuid()`, and no symbolic link.
- Bot currently permits `models.json` to be an owner-controlled symbolic link. Its resolved target may be group-readable or group-writable as long as it belongs to the current user and is not world-writable.
- Pi may resolve environment references and execute leading `!command` values from `models.json`. It may execute a command-backed API key from `auth.json`. Those commands intentionally run with the Bot process owner's operating-system authority.
- ADR 0030's 2026-09-12 amendment already selects a real current-owner `models.json` with exact mode `0600` and no symbolic link. The implementation, tests, and model reference still carry the superseded compatibility rule.
- Bot removes the recognized Pi provider credential environment names before agent-side work. It otherwise preserves the caller environment. Arbitrary names referenced by trusted local Pi configuration cannot be discovered automatically.

## Scope

- Replace the special model-file symlink and resolved-target validation with the same leaf rule used for authentication: an existing `models.json` must be a non-symbolic-link regular file owned by the effective user with exact mode `0600` and must be readable.
- Keep the existing `0700` real-directory rule for the Pi agent directory and the existing `0600` real-file rule for `auth.json`. Use the effective user ID consistently for these runtime checks, matching the authentication importer, and do not substitute the real user ID when they differ.
- Permit a missing agent directory, `auth.json`, or `models.json` at preflight. Preserve Pi's ownership of later directory and authentication-file creation. Bot does not create a model file.
- Validate only the paths the selected runtime uses. A credential-free provider catalog validates the agent directory and `models.json`. A model runtime or authentication listing validates the directory, `models.json`, and `auth.json`. The logout mutation runtime validates the directory and `auth.json` without loading `models.json`; the full logout command separately resolves the provider through the credential-free catalog first. Authentication import retains its separate validated source and destination boundary.
- Refuse an unsafe required path before constructing Pi's model runtime, reading credential metadata, refreshing a catalog, contacting a provider, executing a configuration command, or mutating credentials.
- Make the validator error name the offending path and concrete required shape. Preserve each public command's existing bounded error projection, including commands that deliberately replace runtime detail with a generic failure. Do not print configuration or credential content. Put the exact repair procedure in public documentation.
- Preserve Pi's public package-root boundary, built-in and declarative providers, custom endpoints and headers, environment interpolation, command-backed values, offline startup, explicit live refresh, authentication precedence, locking, login, logout, and import behavior.
- Preserve ordinary environment inheritance for assemblies while removing the recognized provider credential variables before agent-side tools, hooks, gates, and subprocesses run. Do not introduce a minimal environment, executable allowlist, authored tool restriction, or command parser.
- Give offline repository gates that construct Pi runtimes a suite-owned agent directory beneath their private temporary root. They must not inherit or inspect the operator's Pi configuration.
- State the boundary plainly in the specification and public model documentation. The permission checks limit who can supply executable local configuration through ordinary filesystem access. They do not sandbox trusted configuration, allowed commands, agents, or same-account replacement races.
- Reconcile ADR 0030's operative decision and accepted-cost text with its amendment. Preserve the earlier rule as history rather than leaving two current decisions in the same ADR.
- Do not edit Pi, inspect the operator's configuration contents, repair or replace an existing operator file, add ancestor, ACL, hard-link, descriptor-pinning, or race protections, or claim native Windows support.

## Acceptance

Start with failing focused tests. Table-driven POSIX tests prove that `models.json` refuses a symbolic link regardless of its target, a directory or other non-regular leaf, a foreign owner, an unreadable leaf, and every representative mode outside exact `0600`, including `0644`, `0660`, `0400`, and world-writable forms. Each refusal occurs before the injected runtime factory is called. Focused factory-ordering tests cover the credential-free catalog, configured model runtime, and authentication-list routes. Existing agent-directory, authentication-file, authentication-only logout, and import tests retain their separate pre-factory or pre-mutation proofs.

An ownership test makes the real and effective user IDs differ and proves that the effective user owns the decision. Platforms without an effective-user ownership API retain no stronger Bot claim and are handled by the later native-Windows refusal.

A missing agent directory and missing files pass preflight. A valid regular `0600` model file still loads a custom provider and model, resolves an environment-backed API key, and resolves a command-backed header. Existing tests retain command-backed authentication behavior, offline startup, no startup stream, no catalog network on ordinary creation, and provider-owned file authentication.

Environment tests prove the full recognized Pi credential-name registry is absent from the environment used for agent-side work while an unrelated canary remains. Existing hook, gate, tool, and subprocess environment witnesses stay green. No test reads or changes the operator's Pi configuration, invokes a paid provider, or edits the Pi checkout.

The offline examples gate replaces an inherited `PI_CODING_AGENT_DIR` before invoking any assembly check. A focused shell witness supplies a hostile operator path, proves that every check receives the gate-owned path beneath its private temporary root, and leaves the operator canary unchanged.

Documentation names the exact migration: replace a model-file link with a private regular copy owned by the user and set mode `0600`. It also says that trusted `!command` values retain the operator's authority and that a same-account actor or path race remains outside the boundary. Update the specification changelog and invariant witnesses where the current public contract changes.

Run focused model-runtime, authentication, environment, specification-publication, and documentation tests, then the complete local gate. Independent code review must inspect every Pi runtime construction route, refusal ordering, platform-conditional behavior, diagnostic secrecy, retained configuration features, and any environment-claim drift. The implementation and completion commits pass hosted checks.

## Dependencies

Ticket 0273 removed authored tool restrictions and established the trusted-assembly boundary. Ticket 0276 established the supported Unix command-line behavior. Later platform qualification proves the same filesystem contract on Linux and macOS and refuses native Windows with WSL guidance.

## Risk facts

This change deliberately breaks an existing `models.json` symbolic link or any existing model file whose mode is not exactly `0600`. Bot will refuse it and will not rewrite it. Public documentation supplies the repair: replace the link with a regular private file. The check remains a preflight pathname check. A process running as the same operating-system account can still replace the file after validation, and trusted configuration commands still have that account's authority. Stronger race resistance or command containment would require a different runtime boundary and is not selected.

## Size decision

- Starting production size: 18142 nonblank lines
- Ending production size: 18142 nonblank lines
- Simpler approach tried: Reject only group or other permission bits on the resolved target while retaining owner-controlled symbolic links.
- Why insufficient alternatives were rejected: A symbolic link keeps the executable configuration outside the private agent directory and preserves the implementation drift that the accepted ADR amendment explicitly closed.
- Production code added: One shared private-leaf rule, one effective-user lookup, and an effective-authority read-only open and close check with concrete diagnostics.
- Production code deleted: Model-specific link resolution, target inspection, and its broader permission policy. The production tree stayed at 18142 nonblank lines.
- Accepted cost: Existing linked or broadly readable model configuration requires one manual copy and permission change.

## Complexity

- Contract score: 1
- State and timing score: 1
- Reach score: 1
- Proof score: 2
- Cost of error score: 2
- Total: 7
- Minimum level floor: 4, because this check guards credential-bearing and command-capable local configuration.
- Final level: 4
- Reasons: The implementation change is local, but a false acceptance can admit another account's commands and a false refusal can block every model-backed command.
- Selected model: `gpt-6-astra` with xhigh reasoning for design review and `gpt-5.6-sol` with high reasoning for implementation

## Review

- Origin: The 2026-09-13 security reassessment rejected tool sandboxing and retained private Pi files as a real operating-system protection. Ian accepted that recommendation. An independent survey then confirmed the exact implementation drift and the trusted command behavior against Bot and reference-only Pi source.
- Design review: rejected twice, then accepted. The first draft could be read to require unrelated configuration on every command and named effective-user ownership while the implementation uses the real user ID. The second draft conflated the full logout command with its authentication-only mutation runtime and promised detailed public failures that current command contracts intentionally bound. The accepted design preserves each route's file boundary and public error projection, requires `process.geteuid()` consistently, and adds direct ordering and differing-ID witnesses. Astra extra-eyes accepted the narrow filesystem protection and found no reason to split it.
- Implementation evidence: The first focused model-runtime run failed 12 of 26 tests against the old symlink, mode, readability, route-ordering, and real-user behavior. The first implementation passed 30 model-runtime tests. Review remediation then failed three of 32 tests against the real-user readability probe and passed all 32 after an effective-authority read-only open and close replaced it. The old migration shell failed one of four new harmless fixture tests because a regular source did not stop the script; the corrected guards passed all four. The final broader set passed 184 authentication, model, environment, hook, and publication tests. The focused documentation set passed all 47 tests. The six real stage-environment witnesses passed outside the restricted test sandbox. The primary's first complete gate found that the examples script still inherited the operator's Pi directory; the stricter model-file rule correctly refused its linked file. A new focused witness failed against that leak, then all 12 examples-gate tests and the real four-example gate passed after the script created and exported a suite-owned Pi directory. The final complete local gate passed 143 repository and documentation tests, 1,631 runtime tests across 207 files, 143 conformance cases, every static check, and the 18142-line production ratchet under Node 22.22.3. No test read operator configuration, edited Pi, or contacted a provider.
- Code review: rejected once, then accepted. Review found that `fs.access` judged the real user rather than the effective user, the documented shell prerequisites could continue after a regular input, a dangling copy link was not explicitly refused, and ADR 0030 still named the retired stage access policy. Remediation uses a read-only open and awaited close without reading content, adds bounded open and close failures, tests the exact published shell against successful and refused fixtures, and states trusted command authority without the retired policy. Independent rereview passed 51 focused runtime, publication, and environment tests, all four migration tests, and the diff check.
- Completion: the complete local gate passed after independent acceptance. Hosted checks and archival remain pending.
