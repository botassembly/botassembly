import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { afterEach, expect, test } from "vitest";
import { main } from "./initialized-cli.ts";
import { realBoundary, tempRoots, writes } from "./cli-boundary.ts";
import { resumeDependencies } from "../src/run-command.ts";

const roots = tempRoots();
afterEach(() => roots.cleanup());

test("run and resume dependencies use the same injected model runtime path", async () => {
  const { root, home } = await roots.scratch("bot-model-runtime-wiring-");
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(flow, "01-work.md"), "---\n---\nDo the work.\n"),
  ]);
  const output: Buffer[] = [];
  const errors: Buffer[] = [];
  const { held, faux } = realBoundary(root, home, output, errors);
  const runtime = held.models;
  if (runtime === undefined) throw new Error("fixture supplied no model runtime");
  Reflect.deleteProperty(held, "models");
  let constructions = 0;
  let created: Promise<typeof runtime> | undefined;
  const factory = (): Promise<typeof runtime> => {
    created ??= Promise.resolve().then(() => { constructions += 1; return runtime; });
    return created;
  };
  held.modelRuntime = factory;
  faux.setResponses([writes("$OUTPUT", "done"), fauxAssistantMessage("finished")]);

  await expect(main(["run", "start", "review/main", "request"], held)).resolves.toBe(0);
  expect(constructions).toBe(1);
  const [donor] = await readdir(join(home, "runs"));
  if (donor === undefined) throw new Error("run created no donor");
  faux.setResponses([writes("$OUTPUT", "done again"), fauxAssistantMessage("finished")]);
  await expect(main(["run", "resume", donor], held)).resolves.toBe(0);
  expect(constructions).toBe(1);
  expect(resumeDependencies(held, undefined).modelRuntime).toBe(factory);
  expect(Buffer.concat(errors).toString()).toBe("");
});

test("an unknown model keeps the exact refusal through an injected runtime run", async () => {
  const { root, home } = await roots.scratch("bot-model-runtime-refusal-");
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { model: missing-model, reasoning: medium }\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main\n---\n"),
    writeFile(join(flow, "01-work.md"), "---\n---\nDo the work.\n"),
  ]);
  const output: Buffer[] = [];
  const errors: Buffer[] = [];
  const { held } = realBoundary(root, home, output, errors);
  const runtime = held.models;
  if (runtime === undefined) throw new Error("fixture supplied no model runtime");
  Reflect.deleteProperty(held, "models");
  held.modelRuntime = () => Promise.resolve(runtime);

  await expect(main(["run", "start", "review/main", "request"], held)).resolves.toBe(2);
  expect(Buffer.concat(errors).toString()).toBe(
    "model-unresolved  flows/main/01-work.md\n  No provider offers a model named missing-model. Name a model one of these providers offers: faux.\n",
  );
  expect(await readdir(join(home, "runs"))).toEqual([]);
});
