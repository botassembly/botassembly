# Refusals

> **Stability: stable.**

A malformed assembly is refused before anything runs, and so is a request bot
cannot act on. Every refusal carries a **code**, the **path** at fault, and a
sentence for whoever is reading ([the runtime](runtime.md#refusing-an-assembly)).

```text
alternative-mismatch  flows/triage/04-decide/CHOOSE.md
  Lists `revert`, which is not in the folder.
```

`--json` writes one object per line: `{ "code", "path", "message" }`.

## What a refusal carries

A refusal about a model names four more facts, because a sentence alone makes a
reader parse prose to act: the **model** string as it was authored, the
**provider** it named if it named one, the **rung** the model resolved from, the
**cause** the runtime observed, and the **action** that fixes it. A cause is
drawn from the error envelope's closed cause vocabulary
([the error envelope](inspection.md)). A refusal that is not about a model
carries none of them.

A run mutation's `--json` refusal array carries these as fields beside the
three above: `{ "code", "path", "message", "model", "provider", "rung",
"cause", "action" }`, with `null` in each of the five where the refusal has no
such fact. Every one of the eight fields occupies at most 512 UTF-8 bytes, and a
field cut to that bound ends in a single ellipsis character. `message` holds the
same facts as a sentence.

A runtime states what it observed and nothing past it. A model name its catalog
does not hold is a name that catalog does not hold. It is not a retired model,
and it is not a model no provider anywhere offers. A provider whose credential
the runtime cannot see is a provider this runtime cannot call, and the run is
refused before it is born rather than born and killed at the first stage.

The code and the path are what [the corpus](../conformance.md) asserts on; the
code is what a person greps for. The corpus never asserts a sentence, which is
what lets it check two runtimes against each other without coupling them to one
runtime's prose: a sentence is free to be reworded, translated, or improved. A
runtime that pins its own sentences in its own tests binds itself, not this
specification.

A code names the fault a person must fix, never the rule that caught it
([invariant 39](invariants.md)). Two faults with the same fix share a code, and
the sentence — which was always free text — says which way this one went wrong.
That is why the vocabulary is short and stays short.

Every refusal names one fault. A runtime reports every fault it found rather
than stopping at the first, and exits `2`. The order they are reported in is
not specified, and "every fault" is scoped to the phase that refused: every
structural fault is reported together, and faults of resolution — a model no
rung supplies, an input collision — appear once there is a sound structure to
resolve against.

When two codes could describe one fault, the more specific wins, and the order
of the tables below is the order of specificity. A non-executable file in a
`gate/` folder is `not-runnable` rather than `entry-unknown`.

## Sentinels

| Code                 | The fault                                          |
| -------------------- | -------------------------------------------------- |
| `sentinel-missing`   | a folder in a flow holds no sentinel                |
| `sentinel-duplicate` | a folder holds two                                  |
| `sentinel-unknown`   | a markdown file that looks like a sentinel and is not one *here* — a capitalized name that names no type, a sentinel's name in the wrong case, `Stage.md` and `loop.md` alike, or a real sentinel standing where its type cannot stand, a `FLOW.md` in a stage's position. `README.md` excepted, which is inert anywhere. The sentence can say what was probably meant |
| `body-missing`       | a stage whose body is empty — a stage with no instruction |
| `tail-container`     | a container standing where a stage must stand — any sequence's last entry, whatever the container, or a branch or alternative that is directly a `PARALLEL` |

## Frontmatter

| Code                   | The fault                                        |
| ---------------------- | ------------------------------------------------ |
| `frontmatter-invalid`  | the YAML (1.2) does not parse or holds a duplicate key, or a sentinel is not fenced frontmatter and body ([invariant 42](invariants.md)) — documents are UTF-8 without a byte-order mark, a BOM is refused by name, never silently stripped, and a byte that is not UTF-8 is refused in frontmatter and in [the home configuration](home.md) where in [a body](stage.md#the-prompt-and-the-configuration) it is not |
| `key-unknown`          | a key its holder does not accept — a sentinel's frontmatter or a task file's |
| `key-missing`          | a required key is absent — `repeat` on a `LOOP.md`, `max-depth` on a `DESCEND.md`, or `model`/`reasoning` in an [intelligence bundle](home.md#intelligences) |
| `value-invalid`        | a value of the wrong type, outside its set, or outside its bounds ([the bounds](invocation.md#options-and-where-they-resolve)); `DESCEND.md` accepts `max-depth` only as a safe integer from 1 through 11; this also includes an assembly `strict` value that is not boolean, and a `folders` value that is not a list of valid top-level names, uses reserved `ASSEMBLY.md`, `flows`, `skills`, `subflows`, `README.md`, `LICENSE`, or `gate`, or names an existing root that is not a real directory; the sentence says which |
| `intelligence-unresolved` | a named intelligence, including the implicit `default`, has no row in [the home table](home.md#intelligences) |
| `model-unresolved`     | no provider in the catalog the runtime read offers the resolved model under the name given, or a providerless row names a model more than one provider offers. One fix in two shapes: settle the name |
| `slot-reserved`        | a declared slot with an unusable name, whose uppercase export collides with another declaration, shadowing a runtime slot's name, or shadowing a variable already set in the environment — `path` would become `$PATH` |

The retired authored keys `model`, `provider`, `reasoning`, `profile`, and
`tier`, the loose home keys and `profiles` table, and their long options are
`key-unknown`. Their sentences point to the home `intelligences` table and
`--intelligence`; no new refusal code is introduced.

## Files in a stage folder

| Code              | The fault                                            |
| ----------------- | ---------------------------------------------------- |
| `schema-duplicate`| more than one schema                                 |
| `schema-invalid`  | a schema that does not parse, is not valid JSON Schema, or names a dialect other than 2020-12 |
| `gate-conflict`   | a `gate` file beside a `gate/` folder                |
| `hook-duplicate`  | two files whose **hook name** is the same. A hook name is everything before the first dot, so `success.v2.sh` and `success.sh` are one hook |
| `not-runnable`    | a hook or gate that cannot run — no executable bit, or no shebang on something that is not a binary |
| `skill-invalid`   | a skill folder with no `SKILL.md`                    |

## Containers

| Code                   | The fault                                             |
| ---------------------- | ----------------------------------------------------- |
| `alternative-mismatch` | `CHOOSE.md` and its folder disagree — one lists what the other does not hold, in either direction |
| `chooser-invalid`      | a `CHOOSE` with a single alternative, which is no choice |
| `branch-numbered`      | a branch or alternative given a leading number         |
| `body-unexpected`      | a body on a sentinel that asks nothing                 |
| `container-check`      | a schema, gate, checklist, or hook on a container      |
| `loop-nested`          | a `LOOP` inside a `LOOP`, at any depth ([invariant 40](invariants.md)) |

## Structure

| Code               | The fault                                       |
| ------------------ | ----------------------------------------------- |
| `number-duplicate` | two entries in a sequence sharing a number      |
| `number-missing`   | an unnumbered entry where the order matters     |
| `number-invalid`   | a sequence number longer than nine digits       |
| `symlink`          | a symbolic link anywhere in the assembly        |
| `entry-unknown`    | a visible file or directory the grammar does not recognize under the assembly's strict-by-default [root policy](assembly.md#assemblymd), or a name the grammar reserves for a folder (`skills`, `subflows`) held by a plain file |
| `folder-empty`     | a folder that promises contents and holds none, wherever it stands — a flow, a `gate/`, a `subflows/`, a `skills/`, an alternative, a `CHOOSE` with no alternatives. The rule, not a list |
| `input-collision`  | two things that would share one name where one is addressed — sources in one `$INPUT` (the **source name** is everything before the last dot, so `review.txt` and `review.json` collide and `notes.v2.txt` and `notes.txt` do not), or a flow and a root subflow in the assembly agent's scope |
| `assembly-incomplete` | no `ASSEMBLY.md`, or no `flows/`             |

## Resolution

| Code                | The fault                                      |
| ------------------- | ---------------------------------------------- |
| `assembly-unknown`  | no assembly of that name in the home, none at the explicit path given, or none at the source `bot assembly install` was pointed at ([assembly commands](management.md)) |
| `flow-unknown`      | no flow of that name in the assembly           |
| `path-missing`      | a required path does not exist as the kind of path it names, and the fix is to provide one that does: `--in`'s working directory, a stage's authored working directory, a declared slot's value, a `@task` file; and, putting an assembly in the home ([assembly commands](management.md)), a source that is neither a folder that exists nor one git can clone, a `#subdir` the fetched source does not hold, or a link's target |
| `request-invalid`   | the command line asks for something bot cannot act on, and the fix is to change what was asked for: a command or verb bot does not have; a command given the wrong arguments, or an option given no value; a request not given exactly one way — more than one of argument, `@file`, and stdin, or none of them; a target that reads as two different assemblies ([naming](invocation.md#naming-the-assembly)); a name that would leave the home, or one the home already holds; or a `#subdir` that would leave its install source ([assembly commands](management.md)) |
| `slot-missing`      | a declared slot the run did not supply         |
| `credential-missing` | a provider holds the resolved model and the runtime found no credential for that provider. The fix is to sign in, which no other code names ([providers](home.md#intelligences)) |

## Managing the home

[The assembly commands](management.md) have their own refusal codes. These are faults of the home or of the
machine rather than of an assembly a runtime read, so the corpus holds no case
for one: a live run and a missing program are not checked-in data. A runtime
pins them with its own tests instead ([invariant 50](invariants.md)).

| Code               | The fault                                       |
| ------------------ | ----------------------------------------------- |
| `assembly-in-use`  | an assembly a live run holds, or one nothing can prove idle because a run whose record cannot be read is still going. One fault either way — a run in this home is going — and one fix: wait for it to end ([`bot run list`](inspection.md#bot-run-list)) |
| `source-unknown`   | an installed assembly with no source to fetch again from — written by hand, or copied in by some other means |
| `tool-missing`     | a program the runtime has to run is not there — installing from a git source runs `git` |

## Runtime-only refusals

Some refusals a runtime gives while reading an assembly have no corpus case. A
code is exempt only when this section declares it, and a declaration is one
sentence of the form "`<code>` is runtime-only, because <reason>." No other
mention of a code here exempts it. A runtime pins each declared code with its
own tests instead ([invariant 50](invariants.md)), for the reason
[managing the home](#managing-the-home) is pinned that way.

`model-unresolved` is runtime-only, because it is decided against the providers
a runtime has configured, and a corpus case carries no provider configuration.

`credential-missing` is runtime-only, because a static corpus cannot supply a
provider whose credential is absent, and the answer depends on the credentials
the runtime can see.

## Adding to this

A new rule in the specification is always a new case in the corpus. It is a new
**code** only when no existing code names the fault a person must fix — most new
rules are new ways an existing fault can happen, and land under an existing
code. A rule with no case cannot be tested, and a rule that cannot be tested is
a rule two runtimes will disagree about. [Managing the home](#managing-the-home)
is where that price is paid: those refusals have no case, so its table is the
whole of what two runtimes agree on.
