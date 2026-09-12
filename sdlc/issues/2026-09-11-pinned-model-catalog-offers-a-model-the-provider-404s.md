# The pinned model catalog offers a model the provider no longer serves

`bot models` lists `google gemini-2.5-flash-lite`. The first-assembly guide tells a new user
to "copy one provider/model pair" out of that listing into `config.yaml`. Doing exactly that
produced a run that died before any stage:

```
$ bot run ./reading-list/digest < article.txt
fault: {"error":{"message":"{\n  \"error\": {\n    \"code\": 404,\n    \"message\": \"This model models/gemini-2.5-flash-lite is no longer available to new users. Please update your code to use models/gemini-3.5-flash-lite ...\",\n    \"status\": \"NOT_FOUND\"\n  }\n}\n","code":404,"status":"Not Found"}}
exit 2
```

Two observations.

The catalog is pinned and the guide presents it as the authoritative place to pick from, so a
pinned entry that the provider has retired is a guide that hands new users a broken first run.
`bot check` cannot catch it by design ("it calls no model, so it says nothing about whether a
provider is configured or a model is reachable"), which leaves the user with no pre-flight
signal at all.

The fault line is the provider's JSON body, itself carrying a JSON string with escaped
newlines, printed raw. The recovery instruction the provider supplied is buried inside two
layers of escaping.

Record: `2026-09-11T12-30-16-967d` in the experiment home, exit 2, cause `fault`, 0 tokens.
