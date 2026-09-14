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
    "model-unresolved  flows/main/01-work.md\n"
    + "  Model missing-model resolves from the assembly rung. The catalog Bot read holds no model of that name under any provider. Run bot model list to see the names it holds.\n",
  );
  expect(await readdir(join(home, "runs"))).toEqual([]);
});

/** The injected runtime with one seam: `streamSimple` throws what the test
 *  hands it. Everything else — availability, the catalog, the model row — is
 *  the real faux runtime, so the run is born and dies where a real provider
 *  failure would put it. */
function throwingModels<T extends object>(models: T, reason: unknown): T {
  return new Proxy(models, {
    get: (target, property, receiver) => property === "streamSimple"
      ? () => { throw reason; }
      : Reflect.get(target, property, receiver) as unknown,
  });
}

interface StageFailure { exit: number; stdout: string; stderr: string }

async function stageFailure(prefix: string, reason: unknown): Promise<StageFailure> {
  const { root, home } = await roots.scratch(prefix);
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
  const { held } = realBoundary(root, home, output, errors);
  const runtime = held.models;
  if (runtime === undefined) throw new Error("fixture supplied no model runtime");
  held.models = throwingModels(runtime, reason);
  const exit = await main(["run", "start", "review/main", "--retries", "0", "request"], held);
  return { exit, stdout: Buffer.concat(output).toString(), stderr: Buffer.concat(errors).toString() };
}

// Ticket 0283. A provider that answers with a refusal has its own status and
// text repeated rather than replaced, and Bot says which model and which rung
// asked for it. Pi's sentence is quoted inside Bot's, never passed on alone.
test("a provider refusal after birth repeats its status and names the model and rung", async () => {
  const held = await stageFailure(
    "bot-provider-refusal-",
    new Error('OpenAI API error (401): {"type":"CreditsError","message":"no credits"}'),
  );
  // A provider fault ends the run with cause `fault` and exit 2 (record.md),
  // and the sentence reaches the reader on standard error. Standard output
  // carries the run's own result, so the two streams are read apart.
  expect(held.exit).toBe(2);
  expect(held.stderr).toContain(
    'Model faux-1 resolves from the assembly rung. Provider faux refused the call and reported: OpenAI API error (401): {"type":"CreditsError","message":"no credits"}. Act on that report, then run the flow again.',
  );
  expect(held.stdout).not.toContain("refused the call");
});

// The non-Error throw credentials.ts used to render as "The provider retry
// failed with a non-Error value." — a sentence naming neither the model nor
// anything to do about it.
test("a non-Error throw after birth names the model, the provider, and the retry", async () => {
  const held = await stageFailure("bot-provider-nonerror-", "a bare string");
  expect(held.exit).toBe(2);
  expect(held.stderr).toContain(
    "Model faux-1 resolves from the assembly rung. The call to provider faux failed before an answer arrived. Run the flow again.",
  );
  expect(held.stderr).not.toContain("non-Error value");
  expect(held.stdout).not.toContain("failed before an answer arrived");
});
