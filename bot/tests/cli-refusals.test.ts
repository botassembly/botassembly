// Ticket 0029 — upfront refusals the run path was missing: an unknown --flag
// (B1), a provider-ambiguous model naming its candidates (B4), a BOM on a
// fence-less optional-frontmatter task file (B6), and a child FLOW.md whose
// model no provider resolves (0027 finding).
import { semanticCheck } from "./semantic-check.ts";
import { createModels, fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { main, type CliBoundary } from "./initialized-cli.ts";
import type { DriverClock } from "../src/process.ts";

const roots: string[] = [];
const clock: DriverClock = {
  milliseconds: () => performance.now(),
  timestamp: () => new Date().toISOString(),
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function scratch(prefix: string): Promise<{ root: string; home: string }> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return { root, home: join(root, "home") };
}

async function assembly(home: string): Promise<void> {
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default:\n    provider: faux\n    model: faux-1\n    reasoning: medium\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(flow, "01-first.md"), "---\n---\nWrite the first result.\n"),
  ]);
}

function boundary(root: string, home: string, output: Buffer[], errors: Buffer[], faux = fauxProvider({ tokensPerSecond: 10_000 })) {
  const models = createModels();
  models.setProvider(faux.provider);
  const held: CliBoundary = {
    cwd: root,
    env: { ...process.env, BOT_HOME: home, PWD: root, XDG_CACHE_HOME: join(root, "cache") },
    stdinIsTTY: true,
    stderrIsTTY: false,
    readStdin: () => Promise.resolve(Buffer.alloc(0)),
    stdout: (bytes) => { output.push(Buffer.from(bytes)); },
    stderr: (bytes) => { errors.push(Buffer.from(bytes)); },
    clock,
    models,
  };
  return { held, faux };
}

async function slottedAssembly(home: string): Promise<void> {
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\nslots:\n  bot_ambient_probe: a probe slot\n---\nReview assembly.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(flow, "01-first.md"), "---\n---\nWrite the first result.\n"),
  ]);
}

// B3: the slot-reserved check consults the INJECTED boundary environment,
// never ambient process.env — in both directions.
test("slot-reserved judges the injected env: an ambient-only variable does not refuse, an injected one does", async () => {
  const { root, home } = await scratch("bot-refusal-env-");
  await slottedAssembly(home);
  const probe = "BOT_AMBIENT_PROBE";
  vi.stubEnv(probe, "ambient-only");
  try {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const { held } = boundary(root, home, stdout, stderr);
    held.env = { BOT_HOME: home, PWD: root };
    await expect(semanticCheck([ "review/main", "--bot_ambient_probe", "."], held)).resolves.toBe(0);
    expect(Buffer.concat(stderr).toString()).not.toContain("slot-reserved");
  } finally {
    vi.unstubAllEnvs();
  }
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = boundary(root, home, stdout, stderr);
  held.env = { BOT_HOME: home, PWD: root, [probe]: "injected" };
  await expect(semanticCheck([ "review/main", "--bot_ambient_probe", "."], held)).resolves.toBe(2);
  expect(Buffer.concat(stderr).toString()).toContain("slot-reserved");
});

test("an unknown --flag refuses as key-unknown instead of silently vanishing", async () => {
  const { root, home } = await scratch("bot-refusal-flag-");
  await assembly(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = boundary(root, home, stdout, stderr);
  await expect(main(["run", "start", "review/main", "--modle", "gpt-x", "the request"], held)).resolves.toBe(2);
  expect(Buffer.concat(stderr).toString()).toContain("key-unknown  --modle");
  // `runs/` empty rather than absent since ADR 0016: birth makes the run
  // directory before the assembly is read, and the refusal removes it again.
  await expect(readdir(join(home, "runs"))).resolves.toEqual([]);
});

// B4, invocation.md: a model offered by more than one configured provider
// "refuses by naming the candidates rather than picking".
test("a provider-ambiguous model refuses by naming the candidate providers", async () => {
  const { root, home } = await scratch("bot-refusal-ambiguous-");
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { model: shared-1, reasoning: medium }\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(flow, "01-first.md"), "---\n---\nWrite the first result.\n"),
  ]);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = boundary(root, home, stdout, stderr);
  const ambiguous = createModels();
  ambiguous.setProvider(fauxProvider({ provider: "faux-a", models: [{ id: "shared-1" }] }).provider);
  ambiguous.setProvider(fauxProvider({ provider: "faux-b", api: "faux-b", models: [{ id: "shared-1" }] }).provider);
  held.models = ambiguous;
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(2);
  const text = Buffer.concat(stderr).toString();
  expect(text).toContain("model-unresolved");
  expect(text).toContain("faux-a");
  expect(text).toContain("faux-b");
});

// Ticket 0127: the playtest's only wall. A model no provider offers refused by
// naming the fault and nothing a reader could act on — no document anywhere
// states a provider that works.
//
// Ticket 0128 REDESIGN of "Configure one available provider for this model.
// Providers here: <38 names>". Both halves were wrong for this fault: the
// remedy is to fix the model NAME (the lookup is over every provider's
// catalogue, so nothing reaching here is a configuration fault), and the list
// was every provider pi-ai compiles in, configured or not. `getAvailable()` is
// the models whose provider has complete auth, so the names below are the ones
// whose model ids will actually work — still read off pi-ai, still un-rottable.
test("an unresolvable model says the name is the fault, and names the providers configured here", async () => {
  const { root, home } = await scratch("bot-refusal-providers-");
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { model: no-such-model, reasoning: medium }\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(flow, "01-first.md"), "---\n---\nWrite the first result.\n"),
  ]);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = boundary(root, home, stdout, stderr);
  const two = createModels();
  two.setProvider(fauxProvider({ provider: "faux-a", models: [{ id: "shared-1" }] }).provider);
  two.setProvider(fauxProvider({ provider: "faux-b", api: "faux-b", models: [{ id: "shared-2" }] }).provider);
  held.models = two;
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(2);
  const text = Buffer.concat(stderr).toString();
  expect(text).toContain("model-unresolved  flows/main/01-first.md");
  expect(text).toContain("No provider offers a model named no-such-model.");
  expect(text).toContain("Name a model one of these providers offers: faux-a, faux-b.");
  expect(text).not.toContain("Configure");
  await expect(readdir(join(home, "runs"))).resolves.toEqual([]);
});

// The DERIVATION, not the sentence (driver's audit of 0128). Every other
// fixture in this file builds providers with faux's own auth — `resolve` always
// yields a result, so it is always configured — which makes `getProviders()`
// and `getAvailable()` return the same set and leaves the whole claim of the
// sentence above ("the providers configured here") pinned by nothing: reverting
// to 0127's catalogue read kept the suite green.
//
// So this fixture makes the two sources DISAGREE, using pi's documented "not
// configured": an `ApiKeyAuth.resolve` that yields undefined (auth/types.d.ts).
// The locked provider is in the catalogue and out of the available set, and the
// two assertions below say so before the runtime is asked anything — a test
// that reds if the derivation is ever read off the catalogue again.
//
// Note which model is asked for: `locked-1` would RESOLVE, because the lookup
// reads every provider's catalogue whether its auth is complete or not. That is
// why this refusal is never a configuration fault, and why the unresolvable
// name has to be one neither provider offers.
test("the providers an unresolvable model names are the ones whose auth is complete, not the whole catalogue", async () => {
  const { root, home } = await scratch("bot-refusal-unconfigured-provider-");
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { model: no-such-model, reasoning: medium }\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(flow, "01-first.md"), "---\n---\nWrite the first result.\n"),
  ]);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = boundary(root, home, stdout, stderr);
  const two = createModels();
  const open = fauxProvider({ provider: "faux-open", models: [{ id: "open-1" }] });
  const locked = fauxProvider({ provider: "faux-locked", api: "faux-locked", models: [{ id: "locked-1" }] });
  two.setProvider(open.provider);
  two.setProvider({ ...locked.provider, auth: { apiKey: { name: "Faux locked", resolve: () => Promise.resolve(undefined) } } });
  // The premise, asserted rather than assumed: the two sources differ HERE, so
  // an assertion below that holds for both of them is not holding for either.
  expect(two.getProviders().map((one) => one.id)).toEqual(["faux-open", "faux-locked"]);
  await expect(two.getAvailable().then((models) => models.map((one) => one.provider))).resolves.toEqual(["faux-open"]);
  held.models = two;
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(2);
  const text = Buffer.concat(stderr).toString();
  expect(text).toContain("No provider offers a model named no-such-model.");
  expect(text).toContain("Name a model one of these providers offers: faux-open.");
  expect(text).not.toContain("faux-locked");
});

// The other half of the same sentence: a home where no provider's auth is
// complete has nothing to name, so it says the thing the old sentence said to
// everybody — and now says it only to the reader it is true for.
test("an unresolvable model in a home with no provider configured says to configure one", async () => {
  const { root, home } = await scratch("bot-refusal-unconfigured-");
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { model: no-such-model, reasoning: medium }\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(flow, "01-first.md"), "---\n---\nWrite the first result.\n"),
  ]);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = boundary(root, home, stdout, stderr);
  held.models = createModels();
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(2);
  expect(Buffer.concat(stderr).toString())
    .toContain("No provider offers a model named no-such-model. Configure a provider, then name a model it offers.");
});

// Ticket 0128, found while auditing 0127's claim that this refusal "never"
// fires on missing configuration: there is a third fix under this one code, and
// it was wearing the provider sentence. A subflow resolves from its OWN
// sentinels, the home and the defaults — the parent's command rung stops at the
// boundary (subflow.md) — so a `--model` that carried the parent names nothing
// for the child, and the fix is to name a model, not to touch a provider.
test("a subflow without the default intelligence names its unresolved row", async () => {
  const { root, home } = await scratch("bot-refusal-child-modelless-");
  const base = join(home, "assemblies/review");
  await Promise.all([
    mkdir(join(base, "flows/main"), { recursive: true }),
    mkdir(join(base, "subflows/helper"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(base, "ASSEMBLY.md"), "---\n---\nReview assembly.\n"),
    writeFile(join(base, "flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(base, "flows/main/01-parent.md"), "---\n---\nCall the helper.\n"),
    writeFile(join(base, "subflows/helper/FLOW.md"), "---\ndescription: helper flow\n---\n"),
    writeFile(join(base, "subflows/helper/01-answer.md"), "---\n---\nAnswer the question.\n"),
  ]);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = boundary(root, home, stdout, stderr);
  await expect(main(["run", "start", "review/main", "--intelligence", "default", "the request"], held)).resolves.toBe(2);
  const text = Buffer.concat(stderr).toString();
  expect(text).toContain("intelligence-unresolved  subflows/helper/01-answer.md");
  expect(text).toContain("default");
});

// Ticket 0076: DESCEND exposes the flow itself as a child, which cannot inherit
// the command rung that starts its parent.
test("a DESCEND self-child without default intelligence refuses before the run starts", async () => {
  const { root, home } = await scratch("bot-refusal-descend-modelless-");
  const base = join(home, "assemblies/review");
  await mkdir(join(base, "flows/main"), { recursive: true });
  await Promise.all([
    writeFile(join(base, "ASSEMBLY.md"), "---\n---\nReview assembly.\n"),
    writeFile(join(base, "flows/main/DESCEND.md"), "---\ndescription: main flow\nmax-depth: 1\n---\n"),
    writeFile(join(base, "flows/main/01-work.md"), "---\n---\nDo the work.\n"),
  ]);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = boundary(root, home, stdout, stderr);
  await expect(main(["run", "start", "review/main", "--intelligence", "default", "the request"], held)).resolves.toBe(2);
  expect(Buffer.concat(stderr).toString()).toContain("intelligence-unresolved  flows/main/01-work.md");
  await expect(readdir(join(home, "runs"))).resolves.toEqual([]);
});

test("a DESCEND self-child with a model still runs", async () => {
  const { root, home } = await scratch("bot-refusal-descend-model-");
  const base = join(home, "assemblies/review");
  await mkdir(join(base, "flows/main"), { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n"),
    writeFile(join(base, "ASSEMBLY.md"), "---\n---\nReview assembly.\n"),
    writeFile(join(base, "flows/main/DESCEND.md"), "---\ndescription: main flow\nintelligence: default\nmax-depth: 1\n---\n"),
    writeFile(join(base, "flows/main/01-work.md"), "---\n---\nDo the work.\n"),
  ]);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = boundary(root, home, stdout, stderr);
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("write", { path: "$OUTPUT", content: "done" })], { stopReason: "toolUse" }),
    fauxAssistantMessage("done"),
  ]);
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(0);
  expect(Buffer.concat(stderr).toString()).toBe("");
  expect(Buffer.concat(stdout).toString()).toBe("done");
});

// B6, refusals.md: documents are UTF-8 without a byte-order mark, "a BOM is
// refused by name, never silently stripped" — the fence-less optional-
// frontmatter path gives the same refusal the fenced path gives.
test("a BOM on a fence-less optional-frontmatter task file is refused by name", async () => {
  const { root, home } = await scratch("bot-refusal-bom-");
  await assembly(home);
  await writeFile(join(root, "task.md"), "\uFEFFDo the thing.\n");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = boundary(root, home, stdout, stderr);
  await expect(semanticCheck([ "review/main", "@task.md"], held)).resolves.toBe(2);
  expect(Buffer.concat(stderr).toString()).toContain("frontmatter-invalid  task.md");
});

// 0027 finding: a child FLOW.md naming an unresolvable model is an upfront
// model-unresolved refusal at run start, not a call-time fault — subflows are
// walked recursively, same rule as the root.
test("a subflow child naming an unresolvable model refuses upfront, before any run starts", async () => {
  const { root, home } = await scratch("bot-refusal-child-model-");
  const base = join(home, "assemblies/review");
  await Promise.all([
    mkdir(join(base, "flows/main"), { recursive: true }),
    mkdir(join(base, "subflows/helper"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux, model: faux-1, reasoning: medium }\n"),
    writeFile(join(base, "ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(base, "flows/main/FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(base, "flows/main/01-parent.md"), "---\n---\nCall the helper.\n"),
    writeFile(join(base, "subflows/helper/FLOW.md"), "---\ndescription: helper flow\nintelligence: absent\n---\n"),
    writeFile(join(base, "subflows/helper/01-answer.md"), "---\n---\nAnswer the question.\n"),
  ]);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held, faux } = boundary(root, home, stdout, stderr);
  faux.setResponses([fauxAssistantMessage("must never be consulted")]);
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(2);
  expect(Buffer.concat(stderr).toString()).toContain("intelligence-unresolved  subflows/helper/01-answer.md");
  // `runs/` empty rather than absent since ADR 0016: birth makes the run
  // directory before the assembly is read, and the refusal removes it again.
  await expect(readdir(join(home, "runs"))).resolves.toEqual([]);
});

test("bot check refuses an unknown --flag the same way", async () => {
  const { root, home } = await scratch("bot-refusal-check-");
  await assembly(home);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = boundary(root, home, stdout, stderr);
  await expect(semanticCheck([ "review/main", "--modle", "gpt-x", "--json"], held)).resolves.toBe(2);
  expect(Buffer.concat(stderr).toString()).toContain('"code":"key-unknown","path":"--modle"');
});
