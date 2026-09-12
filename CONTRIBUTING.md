# Contributing

Read the [specification](specification/README.md) and the current plan before changing the format or runtime. Keep changes focused, add a regression proof for changed behavior, and update the relevant documentation or decision.

Install dependencies with `npm ci` in `bot/`. Run the complete offline check from the repository root:

```sh
make check
```

Run `make smoke` only for deliberate live-provider work. Never commit `.env`, `credentials.json`, `auth.json`, or other secrets.
