# triage

Sorts an inbound customer request into an urgent or a routine queue and writes the routing memo.

## What it exercises

- **A skill in a slot.** `01-classify` reads the priority rubric at `$SKILLS/priority-rubric/SKILL.md`. The rubric is the only place the two tiers are written down.
- **A checklist.** Two items the agent affirms one at a time, each with its evidence in the record.
- **A JSON schema.** `01-classify` must produce an object with `priority`, `trigger`, and `request`, and nothing else.
- **A chooser.** `02-route/CHOOSE.md` picks `urgent/` or `routine/`. The record keeps the branch taken, the branch declined, and the chooser's reason.
- **Two gate scripts.** `03-verify/gate/01-blocker` exits 75 to end the run as blocked rather than rejected. `03-verify/gate/02-sections` rejects a memo that lost a section, and its own words are what reaches the agent on the send-back.
- **Three hooks.** `before`, `success`, and `failure` around `01-classify`. Set `BOT_HOOK_LOG` to a writable file to collect their lines.
- **Front matter on every file.** `ASSEMBLY.md` names the intelligence and one retry. `FLOW.md` carries its required `description` and sets `tmp: flow`, so every stage shares one scratch directory. `01-classify` takes five minutes, the chooser takes two and hands that budget to both arms, and each arm raises its own retries to 2. No file here carries an empty fence.

## The tree

```
triage/
  ASSEMBLY.md                        intelligence: default, retries: 1
  README.md
  skills/priority-rubric/SKILL.md    the two-tier rubric, reached at $SKILLS
  flows/triage/
    FLOW.md                          description, tmp: flow
    01-classify/  STAGE.md (timeout: 300, ## Checklist)  schema.json  before  success  failure
    02-route/     CHOOSE.md (timeout: 120)  urgent/01-urgent.md  routine/01-routine.md
    03-verify/    STAGE.md (retries: 1)  gate/01-blocker  gate/02-sections
```

## Check it

`bot assembly check` resolves the assembly without calling a model. Run it from the folder above, the one holding all four assemblies:

```console
$ bot assembly check ./triage/triage
flows/triage/FLOW.md  flow-definition  type=FLOW  flow=flows/triage  max_subflow_calls=10
01-classify  STAGE  flow=flows/triage  input=request.txt  output=classify.json  options=intelligence=default,provider=google,model=gemini-3.5-flash-lite,reasoning=low,timeout=300,retries=1,local-context=ignore
02-route  CHOOSE  flow=flows/triage  input=-  output=-  options=intelligence=default,provider=google,model=gemini-3.5-flash-lite,reasoning=low,timeout=120,retries=1,local-context=ignore
02-route/routine/01-routine  STAGE  flow=flows/triage  input=classify.json  output=routine.txt  options=intelligence=default,provider=google,model=gemini-3.5-flash-lite,reasoning=low,timeout=120,retries=2,local-context=ignore
02-route/urgent/01-urgent  STAGE  flow=flows/triage  input=classify.json  output=urgent.txt  options=intelligence=default,provider=google,model=gemini-3.5-flash-lite,reasoning=low,timeout=120,retries=2,local-context=ignore
03-verify  STAGE  flow=flows/triage  input=routine.txt  output=verify.txt  options=intelligence=default,provider=google,model=gemini-3.5-flash-lite,reasoning=low,timeout=3600,retries=1,local-context=ignore  possible_inputs=routine.txt,urgent.txt
$ echo $?
0
```

The resolved `provider`, `model`, and `reasoning` are whatever your home's `config.yaml` names under the intelligence `default`, so yours will differ. Everything else in the output is the assembly.

Both arms of the choice resolve to the same option ladder, because both take the chooser's `timeout: 120` and set the same retries. The JSON form says where each value came from.

## Run it

Run these from the folder above. The `@data/...` path resolves against your working directory.

```sh
bot run start ./triage/triage @data/request-urgent.txt
bot run start ./triage/triage @data/request-routine.txt
```

The urgent request names a deadline inside three working days and takes the `urgent` branch. The routine request is a billing question and takes the `routine` branch. The memo lands on stdout; the record lands in your bot home.

Run records and provider sessions remain local. They can contain requests, outputs, tool results, and inherited values. The documentation walkthrough uses a labeled synthetic illustration instead of retained run bytes.

One environment variable makes the blocked path reachable without editing anything:

```sh
BOT_SIM_BLOCKER="ticket-7 timeout" bot run start ./triage/triage @data/request-urgent.txt
```

`01-blocker` exits 75, and the run ends with exit 1, empty stdout, and `blocked:` naming the gate's words.

For the send-back path, delete the `## Action` section from `flows/triage/02-route/urgent/01-urgent.md`. `02-sections` then refuses the memo in its own words, and `retries: 2` bounds the stage to two send-backs before `exhausted:`.
