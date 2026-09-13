# The assembly

> **Stability: stable.**

An assembly is a folder holding `ASSEMBLY.md`, a `flows/` directory, and
optionally `skills/` and `subflows/`.

```text
review-bot/
  ASSEMBLY.md
  flows/
    review/
      FLOW.md
      01-read.md
  skills/
    house-style/
      SKILL.md
```

An assembly holds `ASSEMBLY.md` and `flows/`; without either it is not one. By
default an assembly holds no other visible root entry. It may declare opaque
top-level folders as described below. An `ASSEMBLY.md` anywhere in the grammar's
tree below the root refuses at `check`. It is referenced by name — resolved in
[the home](home.md) — or by an explicit path, and no other way. There is no search of the current directory, no
layering, no shadowing, and no consent step: naming a folder is the act of
choosing to run it.

## `ASSEMBLY.md`

The frontmatter carries the defaults every stage inherits. An assembly's name
is its folder's path under the home's `assemblies/` — like every name in this
format it comes from the filesystem, and nothing inside the folder restates it
([invocation](invocation.md#naming-the-assembly)).

```yaml
intelligence: default
timeout: 3600
retries: 2
```

| Key            | Rule |
| -------------- | ---- |
| `intelligence` | optional; names one complete choice [the home defines](home.md#intelligences) |
| `timeout`      | 3600 seconds |
| `retries`      | 2 |
| `local-context` | one of `ignore`, `announce`, `use`; `ignore` |
| `slots`        | optional; names and describes [the slots this assembly declares](slots.md#declared-slots) |
| `tmp-max-bytes` | optional positive safe integer; the live `$TMP` ceiling, one GiB (`1024 ** 3`) by default |
| `strict`       | optional boolean; whether unknown visible root entries refuse; `true` by default |
| `folders`      | optional YAML list of opaque top-level folder names |

Each `folders` item is a nonempty, non-absolute single path component. It is
not `.`, `..`, and contains neither `/` nor NUL. The reserved names
`ASSEMBLY.md`, `flows`, `skills`, `subflows`, `README.md`, `LICENSE`, and `gate`
cannot be declared. A declaration need not exist; when it does, its root entry
must be a real directory, not a file or symbolic link. Duplicate declarations
have no additional effect.

A declared folder is opaque. Bot establishes only that its root is a real
directory, then does not enumerate, validate, execute, or capture its contents.
The declaration applies to that one root component, not recursively within
folders the grammar owns. Its contents do not contribute to procedure identity.
Installation and update may still carry the folder as transport data.

A copied installation omits every source entry whose basename starts with `.`. Bot writes its own root `.bot-source` after the copy. A linked assembly keeps its source tree unchanged.

With `strict: true`, any other visible unknown root entry is refused as before.
With `strict: false`, any other visible unknown root is likewise opaque and
excluded from procedure identity. Grammar-owned roots are always read and
validated. Hidden entries keep their existing treatment. Invalid policy fields
grant no omission, preserving strict validation.

An authored rung selects at most one intelligence name. If the assembly does
not select one, model choice follows the existing precedence rules; every flow
and stage that does not override the assembly inherits its selection
([invocation](invocation.md#options-and-where-they-resolve)). Other unset
assembly options fall back to the home or built-in defaults by those same
rules.

The body is the assembly's purpose statement, and it enters the context of every
stage ([prompt construction](prompt.md)).

HTML comments are author-to-human and are stripped from every body before it
reaches an agent — here, in a stage, in a `LOOP.md`, in a `CHOOSE.md`. Files on
disk are never rewritten. A body that is nothing but comments is an empty body.

## Skills

A `skills/` directory at the assembly root is visible to every flow and every
stage. This is the widest of the five skill scopes, and the one to use least
([skills](skills.md)).

## Subflows

A `subflows/` directory at the assembly root holds flows every stage can call.
This is the widest of the three subflow scopes, and the same advice applies:
a subflow belongs at the narrowest scope where it is useful
([subflows](subflow.md)).

## Validation

The manifest is read before descendants so its top-level traversal policy can
be applied. Every non-opaque entry is either understood or refused, and a
refusal names the file, directory, or key at fault. A malformed assembly exits `2` and writes no record
([the runtime](runtime.md#refusing-an-assembly)).
