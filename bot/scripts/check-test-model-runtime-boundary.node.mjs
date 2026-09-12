import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkTestModelRuntimeBoundary, HELPER, testSourceModelRuntimeViolations } from "./check-test-model-runtime-boundary.mjs";

const named = `import { ModelRuntime } from "@earendil-works/pi-coding-agent";\n`;
const hostile = [
  `${named}ModelRuntime.create({});`,
  `${named}let Runtime; Runtime = ModelRuntime; Runtime.create({});`,
  `${named}ModelRuntime["create"]({});`,
  `${named}const method = "create"; ModelRuntime[method]({});`,
  `${named}const make = ModelRuntime.create.bind(ModelRuntime); make({});`,
  `${named}const make = Reflect.get(ModelRuntime, "create"); make({});`,
  `${named}let Runtime; ({ ModelRuntime: Runtime } = { ModelRuntime }); Runtime.create({});`,
  `const { ModelRuntime } = require("@earendil-works/pi-coding-agent"); ModelRuntime.create({});`,
  `const pi = require("@earendil-works/pi-coding-agent"); Reflect.get(pi.ModelRuntime, "create")({});`,
  `const pi = await import("@earendil-works/pi-coding-agent"); pi.ModelRuntime.create({});`,
  `export { ModelRuntime as NativeRuntime } from "@earendil-works/pi-coding-agent";`,
  `import { ModelRuntime as Runtime } from "./pi-runtime.js"; Runtime.create({});`,
];

test("the source rule rejects every value-level ModelRuntime acquisition", () => {
  for (const source of hostile) {
    assert.match(testSourceModelRuntimeViolations("tests/probe.test.ts", source)[0] ?? "", /nativeModelRuntime/u, source);
  }
});

test("the source rule accepts type-only, shadowed, helper, and unrelated uses", () => {
  for (const source of [
    `import type { ModelRuntime } from "@earendil-works/pi-coding-agent"; type Runtime = ModelRuntime;`,
    `import { type ModelRuntime as Runtime } from "./pi-runtime.js"; type Held = Runtime;`,
    `function inspect(ModelRuntime) { return ModelRuntime.create({}); }`,
    `OtherRuntime.create({});`,
  ]) assert.deepEqual(testSourceModelRuntimeViolations("tests/probe.test.ts", source), [], source);
  assert.deepEqual(testSourceModelRuntimeViolations(HELPER, `${named}ModelRuntime.create({});`), []);
});

test("the scanner rejects an indirect re-export at its source", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-runtime-reexport-rule-"));
  try {
    await mkdir(join(root, "tests"), { recursive: true });
    await writeFile(join(root, "tests", "pi-runtime.mjs"),
      `export { ModelRuntime as NativeRuntime } from "@earendil-works/pi-coding-agent";`);
    await writeFile(join(root, "tests", "consumer.mjs"),
      `import { NativeRuntime } from "./pi-runtime.mjs"; NativeRuntime.create({});`);
    assert.deepEqual(checkTestModelRuntimeBoundary(root).map((violation) => violation.split(":")[0]), ["tests/pi-runtime.mjs"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the repository scanner checks every Vitest test-source extension", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-runtime-source-rule-"));
  try {
    await mkdir(join(root, "tests", "support"), { recursive: true });
    await writeFile(join(root, HELPER), `${named}ModelRuntime.create({});`);
    const extensions = ["ts", "tsx", "mts", "cts", "js", "mjs", "cjs", "jsx"];
    await Promise.all(extensions.map((extension) => writeFile(join(root, "tests", `hostile.${extension}`),
      `require("@earendil-works/pi-coding-agent").ModelRuntime.create({});`)));
    assert.equal(checkTestModelRuntimeBoundary(root).length, extensions.length);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
