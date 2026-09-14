---
title: "Install"
description: "Install the bot runtime, create its home, name one model choice, and prove the install with a command that calls no model."
---

`bot` installs from a git clone and one `make` target. One command then proves the install without calling a provider or spending anything.

`bot` is the runtime: the program that reads an assembly folder and runs it.

## What you need first

Linux and macOS with Node 22.22 or newer are the native platforms. Windows runs through WSL. Native Windows refuses every command, because `bot` depends on POSIX shell launchers, executable bits, owner and mode checks, Unix signals, and process groups.

You also need `git`, a POSIX shell, and `~/.local/bin` on your `PATH`.

## Install the runtime

```sh
git clone https://github.com/botassembly/botassembly.git
cd botassembly
sh sdlc/scripts/install
make install
```

`sh sdlc/scripts/install` installs exact development dependencies and the pinned secret scanner.

`make install` writes a `bot` launcher to `~/.local/bin/bot`. The launcher runs the command line out of this checkout. Pass `BINDIR=` to write it somewhere else, as in `make install BINDIR="$HOME/bin"`.

`git pull` in the checkout is the upgrade path. Run `sh sdlc/scripts/install` and `make install` after it. `make -C botassembly uninstall` removes the launcher. The install refuses to replace a `bot` that this project did not write.

## Create the home

The home is one directory where `bot` keeps installed assemblies and run records. The default is `~/.local/share/bot`.

`make install` does not create it. Create it yourself and make it mode `0700`.

```sh
export BOT_HOME="$HOME/.local/share/bot"
mkdir -p "$BOT_HOME"
chmod 700 "$BOT_HOME"
```

The mode is not optional. A group-readable or world-readable home stops the first run with exit `5`. [When it refuses or fails](/operate/when-it-refuses/) shows that fault and the repair.

## Name one model choice

An intelligence is a name for one complete model choice: a provider, a model, and a reasoning level. Every stage resolves to one. A run needs a row called `default`.

Ask your machine which models it can call, then write the file.

```sh
bot model list openai-codex
${EDITOR:-vi} "$BOT_HOME/config.yaml"
```

Write this shape. Replace the provider and the model with a pair the listing showed you.

```yaml
intelligences:
  default:
    provider: openai-codex
    model: gpt-5.6-luna
    reasoning: low
```

`model` and `reasoning` are required. `provider` is optional. [Providers, models, and credentials](/operate/providers-and-credentials/) holds the full rules for this file.

## Prove the install

Change into `examples/` in the checkout and check a shipped assembly. `bot assembly check` reads a folder, refuses it if it is malformed, and prints what would run. It calls no model.

A flow is one procedure inside an assembly, from its first stage to its last. A target names the assembly and the flow together.

```sh
cd examples
bot assembly check ./hello/greet
```

```text
flows/greet/FLOW.md  flow-definition  type=FLOW  flow=flows/greet  max_subflow_calls=10
01-welcome  STAGE  flow=flows/greet  input=request.txt  output=welcome.txt  options=intelligence=default,provider=openai-codex,model=gpt-5.6-luna,reasoning=low,timeout=120,retries=2,local-context=ignore
```

Exit is `0`. The `provider`, `model`, and `reasoning` values are the ones your own `config.yaml` names, so yours will differ from this paste.

Here `hello` is the assembly folder and `greet` is the flow inside it. They are different words, and in three of the four shipped assemblies they always are.

If that command refused, read [When it refuses or fails](/operate/when-it-refuses/).

Next: [run the shipped example](/start/run-the-example/).
