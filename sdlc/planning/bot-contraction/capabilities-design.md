# Capabilities design

## Outcome

Ticket 0021 adds `bot capabilities`. It answers which commands the current executable actually supports on the new noun-based surface. The first answer contains `bot capabilities` and `bot run list`. It contains no row copied from the planning matrix and no legacy spelling.

The command reads compiled facts only. It takes no home and performs no filesystem, provider, credential, network, or cache work.

## Contract

The accepted invocation is `bot capabilities [--json|-j]`. `--json` and `-j` are identical. Repeating either mode flag, combining them, supplying `--home`, or supplying any other argument is a malformed request. `--help` remains the normal help request and does not run the command.

Human output is bounded Markdown with command, option, and command-wide limit tables. The command table names operation, command words, output kind and version, modes, home use, mutation behavior, and network behavior. The option table names each accepted option, value type, whether it is required, whether it repeats, any closed values, default, and numeric or byte limits. The limit table names every bound stored at command scope. A command with no options still has a command row. The complete Markdown document is at most 64 KiB.

JSON output is one newline-terminated document:

```json
{
  "schemaVersion": 1,
  "kind": "bot.capabilities",
  "data": {
    "commands": [
      {
        "operation": "capabilities",
        "command": ["capabilities"],
        "output": {"kind": "bot.capabilities", "schemaVersion": 1},
        "modes": ["markdown", "json"],
        "home": "never",
        "mutates": false,
        "network": "never",
        "options": [{"name": "--json", "aliases": ["-j"], "type": "boolean", "repeatable": false}],
        "limits": {"documentBytes": 65536}
      }
    ]
  }
}
```

Commands sort by operation and options sort by long name in bytewise order. Arrays and absent optional properties remain deterministic. The JSON document is at most 64 KiB. The implementation refuses an internal integrity error if the compiled descriptor set exceeds the bound. Successful JSON writes no diagnostic. Malformed invocations use the common error document with operation `capabilities`, exit 2, and no stdout. Human failures are one bounded inert line on stderr.

Each command descriptor has exactly `operation`, `command`, `output`, `modes`, `home`, `mutates`, `network`, `options`, and `limits`. `home` is `never`, `reads`, or `writes`. `network` is `never`, `conditional`, or `requested`. An option has `name`, `aliases`, `type`, and `repeatable`, plus only the closed values, default, numeric range, byte bound, or `required: true` fact that applies. Optional options omit `required`; `required: false` is not a second spelling. The capability result remains schema version 1 because ADR 0024 changes pre-release contracts in place. `limits` holds command-wide facts that do not belong to one option. For `run.list`, these include page default and maximum, aggregate filter value and byte limits, encoded and decoded cursor limits, warning count, and output byte limits. The descriptor reports behavior already enforced by the parser and renderer. It does not create a second value for any limit.

## One compiled inventory

Add a small data-only new-command contract module. A closed descriptor names only facts that parsing, help, dispatch, and capability output need. It contains no handler and no legacy command. The descriptor for `run.list` reuses the exported fields, states, causes, page limits, filter limits, cursor limits, output kind, and schema version that its parser enforces. Move a constant only when sharing removes a duplicate fact; do not move run-list behavior.

The new-command dispatcher holds one handler for every descriptor operation and accepts no handler without a descriptor. It uses the descriptor's command words to recognize `capabilities` and `run list`. The existing legacy `COMMANDS`, `INSPECTIONS`, parsers, renderers, and help screens stay unchanged. The temporary `run` ambiguity keeps its current rule: the new `run list` action wins, and every other second word reaches the legacy run handler.

New help uses descriptor facts for command words, modes, option names, value types, closed values, and limits. Short explanatory prose and examples remain beside the help renderer. The bare help adds the implemented new command paths from the same descriptors. A descriptor therefore cannot advertise an option that parsing rejects or omit an option parsing accepts without making the focused agreement test fail.

`capabilities.ts` renders the already validated descriptor set. It does not inspect source text, import the planning matrix, probe handlers, or infer behavior from help prose. A descriptor-size and integrity check rejects duplicate operations, duplicate command paths, duplicate options, an unknown network value, any `required` value other than true, and a document above the fixed bound during the test and at the command boundary.

## Source ownership

`cli-contract.ts` owns the data-only descriptors and their validation. `run-list-query.ts` exports the existing run-list contract constants, and `cli-contract.ts` references those constants rather than copying their values. `capabilities.ts` owns capabilities parsing and both renderers. A small shared result helper owns the structured new-surface failure envelope and inert human failure line; extracting it from the run-list implementation must leave run-list bytes unchanged. `cli.ts` owns the typed new-handler map and delegates path recognition through the descriptor set. `help.ts` owns explanatory prose and renders new command and option facts from descriptors. Legacy maps and screens remain where they are.

## Red tests

1. Through the real CLI, Markdown and `-j` list exactly `capabilities` and `run.list`. Neither answer contains `runs`, `show`, another legacy spelling, or a planned matrix command such as `run.start`.
2. JSON has `schemaVersion: 1`, kind `bot.capabilities`, deterministic command and option order, and exact descriptors for both implemented commands. `--json` and `-j` are byte-identical and stdout ends in one newline.
3. Every advertised command path dispatches through the real CLI and has help. Every new dispatch entry appears exactly once in capabilities. Each advertised option's required status, closed value, default, and limit agrees with its parser and the generated option portion of help. Required home options fail when omitted and appear as required in both help and capabilities.
4. Removing a descriptor, adding an unadvertised new handler, changing one parser limit, or adding a help-only option makes the agreement test fail. Legacy handler and help changes do not affect the inventory.
5. `--home`, an unknown argument, repeated `--json`, and `--json -j` fail before any home or provider dependency can run. JSON failures use the common error shape on stderr only. Human failure text stays one inert bounded line.
6. A descriptor fixture with duplicate operations, command paths, or option names is rejected. A fixture with `required: false` is rejected. An oversized fixture proves both 64 KiB output bounds. The production descriptor set stays far below them.
7. Existing `bot run list`, `bot run --help`, and representative legacy command tests remain byte-identical. Bare help adds `capabilities` and `run list` from the descriptor set and contains no planned command.

## Cost and deferred work

The shared descriptor adds one small indirection to new-command dispatch and help. It prevents the runtime answer from drifting into another handwritten inventory. Legacy commands stay outside that structure because migrating them would turn this reading into a platform rewrite.

Capability filtering is deferred. Two command rows do not need it, the proposed `--feature` vocabulary had no defined meaning, and JSON callers can filter locally. A later ticket can add a typed filter when the implemented result becomes large enough to demonstrate the need.
