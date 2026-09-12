# FANOUT.md accepts the option ladder its specification forbids

The graph specification says of `FANOUT.md`: "The sentinel has no body and exactly these four keys" — `items`, `subflow`, `width`, `max-items`. `docs/src/content/docs/guides/authoring-assemblies.md` repeats the sentence.

`bot check` accepts more than four. Observed against `examples/brief/brief` with a throwaway home, one key added to `FANOUT.md` at a time:

```
[retries: 2]          exit=0
[timeout: 60]         exit=0
[intelligence: default] exit=0
[workdir: x]          exit=2  key-unknown  Remove the unknown key workdir.
[nonsense: 2]         exit=2  key-unknown  Remove the unknown key nonsense.
```

So a fan-out takes the same frontmatter a container takes — every option key except the stage-only `workdir`. Either the specification is short by a paragraph or the parser is wide by a ladder.

The reader cannot tell which, because the fan-out's row in `bot check` prints `options=` with nothing after it. A key that is accepted, invisible, and undocumented is a key nobody can reason about. An author who writes `retries: 2` on a fan-out has no way to learn whether the children got it.

## Which way to settle it

Accepting the ladder is the defensible behaviour: a fan-out is a node whose children are runs, and the keys would say what those children run under. If that is the intent, the specification's fan-out section needs the sentence the container section already has, and the `options=` column needs to carry the resolved ladder so the proof shows it.

If the intent is the four keys, the parser refuses the rest with `key-unknown`, the way it already refuses `workdir`.

Do not guess in an example. `examples/brief` writes exactly the four documented keys.
