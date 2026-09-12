# Skills

> **Stability: stable.**

A skill is a capability the agent can reach for. A flow is a procedure — do
this, then this, then this. A skill is the opposite shape: it is horizontal,
available at any point, and describes how to do a kind of thing rather than what
to do next.

## Progressive disclosure

Skills exist so an agent can be given a large capability without carrying all of
it in context at once. It sees that a skill exists and what it is for; it reads
the rest only when it decides the skill applies.

That only works if the agent is shown as little as possible. **A skill belongs
at the narrowest scope where it is useful.** A skill that only one stage needs
is pushed down to that stage, so no other stage ever sees it. A skill every
stage needs sits at the top.

## The scopes

A `skills/` directory may sit at five places, and its position decides who can
see it.

| Where                                   | Visible to                         |
| --------------------------------------- | ---------------------------------- |
| [`$PWD`](invocation.md#what-pwds-own-context-does) | that stage, and only under `local-context: use` |
| [the assembly root](assembly.md)        | every flow and every stage         |
| [a flow folder](flow.md)                | the stages of that flow            |
| [a container folder](graph.md)          | the stages beneath that container  |
| [a stage folder](stage.md)              | that stage alone                   |

Four of those are the assembly's own. The fifth is not: it belongs to that
stage's effective workspace, and it is admitted only when the caller says so.

A container carries skills the way it carries options: what sits on a
`LOOP`, `CHOOSE` or `PARALLEL` folder belongs to everything beneath it — every
repeat of a loop, every branch of a parallel, whichever alternative a choice
took. It belongs to the stages *beneath* the container, so the agent making a
choice does not read the choice folder's own skills; the stages it chooses
between do. A `skills/` folder is a scope, never a branch and never a step in
the sequence.

## What the agent sees

The agent does not see any of that structure. Skills are flattened into one
list and reached through a slot:

```text
$SKILLS/<skill-name>/
```

A stage with skills `apple` and `banana` of its own, in a flow with `cantaloupe`,
in an assembly with `diamond` and `elephant`, sees exactly five skills — at
`$SKILLS/apple`, `$SKILLS/banana`, `$SKILLS/cantaloupe`, `$SKILLS/diamond`, and
`$SKILLS/elephant`. Nothing in what it sees says which scope any of them came
from.

**Names collide by overriding, narrowest first.** The order is `$PWD`'s own
skills when the run admits them, then assembly, flow, the containers a stage
sits inside from outermost to innermost, then the stage: a stage skill named
`apple` replaces a container's `apple`, which replaces a flow's, which replaces
an assembly's, which replaces the workspace's. One name is one skill.

The workspace is the one scope that is widest without being furthest away. It
sits below the assembly rather than above it because the axis here is trust,
not proximity: the assembly's author chose what the agent is for, and the
repository being worked on did not. An assembly skill named `house-style` is
the one the agent gets, however near the workspace's own `house-style` sits.

## What a skill contains

A skill follows the Agent Skills layout — the standard at
[agentskills.io](https://agentskills.io), repository `agentskills/agentskills`:
a `SKILL.md` describing the capability, and optionally its own `scripts/` and
reference material alongside. Its frontmatter carries a required `description`
— the one line the agent is shown beside the skill's name
([prompt construction](prompt.md)); a `SKILL.md` without one is refused
(`key-missing`). Unlike a sentinel's, this frontmatter is otherwise open: Agent
Skills carry keys of their own, and the format reads `description` and ignores
the rest.

**The folder is the skill's name**, and that is where this format departs from
the standard: upstream requires a `name` key beside `description`, and here
`name` is an extra key like any other — never read, never refused. Folder as
name is what makes narrowest-first override work. This format is stricter in
the other direction: each skill sits in its own folder, and no skill tree holds
an `ASSEMBLY.md` at any depth (`entry-unknown` for either).

A skill's scripts are reached under its own slot path, so a skill's contents
stay together and a skill never reaches into another skill.

## Why the flattening matters

The agent is never told where the assembly lives on disk. The slot is the whole
of what it knows: a name, and a path underneath it that resolves
([slots](slots.md)). This keeps an
agent's attention on its task, and it removes the map that an agent would
otherwise use to go looking for the machinery judging it.
