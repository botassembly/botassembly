import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recordLines, runList } from "../smoke/s6-inspection/facts.mjs";

const list = (data, complete = true) => JSON.stringify({
  schemaVersion: 1, kind: "bot.run.list", data,
  page: { limit: 20, next: null, through: data.at(0)?.id ?? null, complete },
  summary: { returned: data.length, matched: null, warningCount: 0, warningsOmitted: 0 }, warnings: [],
});

test("run list accepts the exact selected row keys and rejects drift", () => {
  const fields = ["id", "tokens"];
  assert.deepEqual(runList(list([{ id: "run-a", tokens: 12 }]), fields).rows, [{ id: "run-a", tokens: 12 }]);
  assert.deepEqual(runList(list([{ tokens: 12, id: "run-a" }]), fields).rows, [{ tokens: 12, id: "run-a" }]);
  const reordered = JSON.stringify({
    kind: "bot.run.list", warnings: [], page: { limit: 20, next: null, through: "run-a", complete: true },
    data: [{ tokens: 12, id: "run-a" }], summary: { returned: 1, matched: null, warningCount: 0, warningsOmitted: 0 }, schemaVersion: 1,
  });
  assert.deepEqual(runList(reordered, fields).rows, [{ tokens: 12, id: "run-a" }]);
  assert.match(runList(list([{ id: "run-a", tokens: "12" }]), fields).error, /numeric/);
  assert.match(runList(list([{ id: "run-a", tokens: 0 }]), fields).error, /positive/);
  assert.match(runList(list([{ id: "run-a" }]), fields).error, /exactly/);
  assert.match(runList(list([{ id: "run-a", tokens: 12 }, { id: "run-a", tokens: 12 }]), fields, "run-a").error, /one row/);
  assert.match(runList(list([{ id: "run-b", tokens: 12 }]), fields, "run-a").error, /run-a/);
  const duplicate = list([{ id: "run-a", tokens: 12 }]).replace('"tokens":12', '"tokens":12,"tokens":12');
  assert.match(runList(duplicate, fields).error, /repeated JSON key/);
  assert.match(runList(list([{ id: "run-a", tokens: 12, state: "ended" }]), fields).error, /exactly/);
});

test("run list accepts typed full rows and rejects malformed values", () => {
  const fields = ["id", "assembly", "flow", "startedAt", "endedAt", "duration", "state", "exit", "cause", "tokens"];
  const row = {
    id: "run-a", assembly: "/tmp/assembly", flow: "main", startedAt: "2026-09-09T13:00:00.000Z",
    endedAt: "2026-09-09T13:00:01.000Z", duration: 1000, state: "ended", exit: 0, cause: "success", tokens: 12,
  };
  assert.deepEqual(runList(list([{ ...row, tokens: null }]), fields).rows, [{ ...row, tokens: null }]);
  assert.match(runList(list([{ ...row, duration: "1000" }]), fields).error, /wrong type/);
  assert.match(runList(list([{ ...row, state: null }]), fields).error, /wrong type/);
  assert.match(runList(list([{ ...row, tokens: "12" }]), fields).error, /wrong type/);
});

test("run list exposes page completeness for a named full-session read", () => {
  const fields = ["id", "tokens"];
  const parsed = runList(list([{ id: "run-a", tokens: 12 }], false), fields);
  assert.equal(parsed.document.page.complete, false);
});

test("record reader rejects malformed JSONL", () => {
  const start = `${JSON.stringify({ event: "run_start" })}\n`;
  assert.equal(recordLines(start).events.length, 1);
  assert.match(recordLines(`${start}not-json\n`).error, /JSONL/);
});

test("the driver reads exact token JSON and fails before validators", () => {
  const driver = readFileSync(new URL("../smoke/run.sh", import.meta.url), "utf8");
  assert.match(driver, /run list --fields id,tokens --limit 200 -j/u);
  assert.match(driver, /runList\(process\.env\.SMOKE_RUN_LIST/u);
  assert.match(driver, /SMOKE_FACTS=/u);
  assert.equal((driver.match(/SPEND=\$\(tokens_of/g) ?? []).length, 9);
  assert.equal((driver.match(/tokens_of "\$taught_run"/g) ?? []).length, 1);
  assert.equal((driver.match(/tokens_of "\$RUN"/g) ?? []).length, 10);
  assert.match(driver, /taught_spend=\$\(tokens_of "\$taught_run"\) \|\| return/u);
});

test("S6 delegates raw record paths to the validating CLI readers", () => {
  const validator = readFileSync(new URL("../smoke/s6-inspection/validate.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(validator, /recordPath|readFileSync\((?:answer|branch|pointed)Path/u);
  assert.match(validator, /createHash\("sha256"\)\.update\(answered\.out\)/u);
  assert.match(validator, /bot\("run", "session", "--raw", run, stage\)/u);
});
