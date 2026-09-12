# hello

Turns a joining note into a three-sentence welcome for a new teammate. This is the smallest assembly the format allows: one manifest, one flow, one stage, one checklist.

## What it exercises

- **One stage.** `01-welcome.md` is a file, not a folder. A stage needs a folder only when it carries a schema, a gate, or a hook.
- **Front matter that sets something.** `ASSEMBLY.md` names the intelligence and a timeout every stage inherits, and the stage cuts its own timeout to 120 seconds. The keys a stage may set are `intelligence`, `timeout`, `retries`, `local-context`, `workdir`, and `access`, and nothing else.
- **A checklist.** Two items the agent affirms one at a time. The checklist is a check, so a stage that skips an item has to say why, and the record keeps the answer.

Nothing else is here. There is no schema, no gate, no hook, no skill, and no container. Read `triage` next for those.

## The tree

```
hello/
  ASSEMBLY.md              intelligence: default, timeout: 300
  README.md
  flows/greet/
    FLOW.md                description, timeout: 180
    01-welcome.md          the one stage, with its checklist
```

## Check it

`bot assembly check` resolves the assembly without calling a model. Run it from the folder above:

```console
$ bot assembly check ./hello/greet
01-welcome  STAGE  input=request.txt  output=welcome.txt  options=intelligence=default@assembly,provider=google@assembly,model=gemini-3.5-flash-lite@assembly,reasoning=low@assembly,timeout=120@stage,retries=2@default,local-context=ignore@default
$ echo $?
0
```

The resolved `provider`, `model`, and `reasoning` are whatever your home's `config.yaml` names under the intelligence `default`, so yours will differ. This paste was taken against a home whose `default` is `google` / `gemini-3.5-flash-lite` / `low`. `timeout=120@stage` is the stage's own key winning over the assembly's 300, and `retries=2@default` is the runtime's own default, because nothing here sets retries.

## Run it

```sh
echo "Priya Raman starts Monday on the support desk. She is joining from the Bristol office and sits with the billing team." | bot run start ./hello/greet
```

The joining note arrives on stdin. Three sentences land on stdout and the record lands in your bot home.
