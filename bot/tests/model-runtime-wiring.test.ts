import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { afterEach, expect, test } from "vitest";
import { main } from "./initialized-cli.ts";
import { realBoundary, tempRoots, writes } from "./cli-boundary.ts";
import { resumeDependencies } from "../src/run-command.ts";
import { SYNTHETIC_CREDENTIAL, planting } from "./synthetic-credential.ts";

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

interface StageFailure { exit: number; stdout: string; stderr: string; home: string }

async function stageFailure(prefix: string, reason: unknown, extra: string[] = []): Promise<StageFailure> {
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
  const exit = await main(["run", "start", "review/main", "--retries", "0", ...extra, "request"], held);
  return { exit, stdout: Buffer.concat(output).toString(), stderr: Buffer.concat(errors).toString(), home };
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

// Ticket 0286. A provider whose error body echoes a credential this run
// supplied under a recognized environment name has that value redacted before
// it reaches any reader: the sentence on standard error, the `--json`
// envelope's bounded `reason`, and the run record's own terminal events. The
// rest of 0283's sentence is unchanged.
const ECHOED = `sk-${SYNTHETIC_CREDENTIAL}-provider-echo`;

function echoing(prefix: string, extra: string[] = []): Promise<StageFailure> {
  return planting("OPENAI_API_KEY", ECHOED, () =>
    stageFailure(prefix, new Error(`OpenAI API error (401): {"type":"AuthError","message":"invalid key ${ECHOED}"}`), extra));
}

const REDACTED_SENTENCE = 'Model faux-1 resolves from the assembly rung. Provider faux refused the call and reported: OpenAI API error (401): {"type":"AuthError","message":"invalid key [redacted OPENAI_API_KEY]"}. Act on that report, then run the flow again.';

test("a provider report echoing a recognized credential is redacted on stderr and in the record", async () => {
  const held = await echoing("bot-provider-credential-");
  expect(held.exit).toBe(2);
  expect(held.stderr).toContain(REDACTED_SENTENCE);
  expect(held.stderr).not.toContain(ECHOED);
  const [run] = await readdir(join(held.home, "runs"));
  if (run === undefined) throw new Error("the failing run wrote no record");
  const record = await readFile(join(held.home, "runs", run, "record.jsonl"), "utf8");
  expect(record).not.toContain(ECHOED);
  const events = record.trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(events).toContainEqual(expect.objectContaining({ event: "run_end", cause: "fault", reason: REDACTED_SENTENCE }));
});

// The claim rests on a proxy over the settled message, and the retained Pi
// session is written from that same message. A session file holding the raw
// value would leave the credential on disk for every later reader of the run.
test("the retained Pi session holds the redacted sentence and not the credential", async () => {
  const held = await echoing("bot-provider-credential-session-");
  const [run] = await readdir(join(held.home, "runs"));
  if (run === undefined) throw new Error("the failing run wrote no record");
  const session = join(held.home, "runs", run, "stages/01-work/1/session.jsonl");
  const text = await readFile(session, "utf8");
  expect(text).not.toContain(ECHOED);
  // The session holds the sentence as a JSON string, so the pin is the escaped
  // form of the same bytes rather than a looser substring.
  expect(text).toContain(JSON.stringify(REDACTED_SENTENCE).slice(1, -1));
});

test("the --json envelope carries the redacted reason and never the credential", async () => {
  const held = await echoing("bot-provider-credential-json-", ["--json"]);
  expect(held.exit).toBe(2);
  expect(held.stdout).not.toContain(ECHOED);
  const envelope = JSON.parse(held.stdout) as { data: { cause: string; reason: { text: string; truncated: boolean } } };
  expect(envelope.data.cause).toBe("fault");
  expect(envelope.data.reason).toEqual({ text: REDACTED_SENTENCE, bytes: Buffer.byteLength(REDACTED_SENTENCE), truncated: false });
});
