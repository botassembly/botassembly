# Contributing

Read the [specification](specification/README.md) and the current plan before changing the format or runtime. Keep changes focused, add a regression proof for changed behavior, and update the relevant documentation or decision.

Install project dependencies and the pinned secret scanner from the repository root:

```sh
sh sdlc/scripts/install
```

Then run the complete offline check:

```sh
make check
```

Run `make smoke` only for deliberate live-provider work. Never commit `.env`, `credentials.json`, `auth.json`, or other secrets. `make check` scans ignored and untracked working files plus every patch reachable from the refs in the local repository. The hosted check fetches public branches and tags. Gitleaks recognizes known patterns and inherits the pinned upstream defaults and their exceptions. It cannot establish that a repository contains no secrets, and some filesystem open failures can be silent. Reported scanner warnings and errors fail the check.
