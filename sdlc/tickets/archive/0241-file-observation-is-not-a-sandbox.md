---
flow: build
priority: 1
---
# File observation is described without implying a sandbox

## Outcome

Public guidance says Bot retains reported direct tool calls. It does not watch the filesystem, report every side effect, or contain code to the working directory.

## Current facts

The runtime intentionally has no sandbox. `SlotExecutionEnv.absolutePath()` passes absolute paths through to Pi. Without an `access` declaration, `createFileTools()` supplies read, write, edit, and Bash tools. `createBoundedFileTools()` can refuse model-facing direct dispatch. It does not constrain an allowed executable.

Current specification wording overstates observation. `specification/elements/runtime.md` says the record shows what the agent reached for. Invariant 37 says an agent that goes looking leaves that in the record. Ordinary allowed file and Bash calls live in retained model sessions. Denied direct calls have separate record events. Commands, scripts, aliases, subprocesses, and outside actors can change files without a distinct reported tool call.

## Scope

Publish this complete boundary:

- Without `access`, the model receives read, write, edit, and Bash tools.
- Direct file tools accept absolute paths. Bot does not confine them to the working directory.
- `access` can refuse model-facing direct calls by managed slot or executable name.
- `access` is not operating-system containment.
- An allowed command, its configuration, aliases, and subprocesses can reach anything the operating system permits.
- Hooks and gates run with the operator's filesystem and network authority.
- Bot retains direct tool calls reported by the model harness and denied direct calls recorded by Bot. It does not watch the filesystem or claim a complete list of changes.
- Operators must supply external containment before they run an untrusted assembly or model.

Clarify the trust paragraph in `README.md`. Correct “The agent's tools” and “What the runtime knows and the agent does not” in `specification/elements/runtime.md`. Narrow invariants 34 through 37 and the matching witness in `specification/elements/invariants.md` and `specification/elements/invariants-witnesses.md`. Replace the broad visibility sentence in `specification/elements/slots.md`. Clarify `bot logs` in `specification/elements/inspection.md` and regenerate its documentation reference. Add the short limit to `docs/src/content/docs/principles.md` and the working-directory warning to `docs/src/content/docs/guides/install-and-use.md`. Add a specification changelog entry. Keep every public document self-contained.

Do not change runtime behavior or command help. Help screens keep their compact command contract. Ticket 0247 will remove legacy inspection commands.

## Acceptance

Update `bot/tests/spec-publication.test.ts` so normative prose must distinguish reported direct calls from filesystem observation and must say that `access` is not containment.

Add or retain one focused runtime assertion that an unrestricted absolute write outside `$PWD` succeeds. The test must remove that outside file and directory. Keep the existing `stage-access-boundary.test.ts` proof that an allowed Git command can read data denied to direct file tools. Do not add a new enforcement path.

Documentation generation, focused tests, and the complete repository check pass.

## Dependencies

None.

## Risk facts

This changes public safety wording. An inaccurate statement could expose operator files, credentials, or network access through misplaced trust. A false claim of complete observation could also make an incomplete audit look complete.

## Complexity

- Contract score: 1
- State and timing score: 0
- Reach score: 1
- Proof score: 1
- Cost of error score: 2
- Total: 5
- Minimum level floor: level 4 for credible security exposure
- Final level: 4
- Reasons: The runtime change is absent. The public trust boundary spans several normative documents. Inaccurate sandbox or observation wording can expose operator resources.
- Selected model: `gpt-5.6-sol` with medium reasoning

Re-score if implementation exposes a new contract, state, timing, reach, proof, or cost-of-error fact.

## Review

- Design review: accepted after the observation, access, process-authority, document-owner, proof, and complexity boundaries became exact
- Code review: accepted after the README described dispatch refusal accurately and the outside-directory test owned cleanup from creation; completed at `4656937`
