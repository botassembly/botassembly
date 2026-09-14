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
import type { RefusalCode } from "../src/spine.ts";

// The two codes refusals.md declares runtime-only. They have no corpus case, so
// this file carries their pins, and it reads each name through spine.ts's own
// type: a name the closed vocabulary drops stops compiling here rather than
// leaving an exempt code with no witness at all (ticket 0283, conformance.ts).
const MODEL_UNRESOLVED: RefusalCode = "model-unresolved";
const CREDENTIAL_MISSING: RefusalCode = "credential-missing";

/** The code a refusal's stderr opens with. */
function openingCode(text: string): string {
  return text.split("  ")[0] ?? "";
}

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
  expect(Buffer.concat(stderr).toString()).toBe(
    "model-unresolved  flows/main/01-first.md\n"
    + "  Model shared-1 resolves from the assembly rung. Providers faux-a, faux-b each offer that name. Set provider on the intelligence row to one of them.\n",
  );
});

// Ticket 0283. Every model failure names the model string as authored, the
// rung it resolved from, what the runtime observed, and one command. The
// catalog Bot read is the whole of what these sentences claim: a name that
// catalog does not hold says exactly that, and never that the model is
// retired or unavailable anywhere else.
test("a model no catalog holds names the model, its rung, and the command that lists names", async () => {
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
  expect(Buffer.concat(stderr).toString()).toBe(
    "model-unresolved  flows/main/01-first.md\n"
    + "  Model no-such-model resolves from the assembly rung. The catalog Bot read holds no model of that name under any provider. Run bot model list to see the names it holds.\n",
  );
  await expect(readdir(join(home, "runs"))).resolves.toEqual([]);
});

// A provider was named, so the claim narrows to that provider's own rows and
// the command narrows with it.
test("a named provider that lacks the model says so of that provider alone", async () => {
  const { root, home } = await scratch("bot-refusal-named-provider-");
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { provider: faux-b, model: shared-1, reasoning: medium }\n"),
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
  expect(openingCode(Buffer.concat(stderr).toString())).toBe(MODEL_UNRESOLVED);
  expect(Buffer.concat(stderr).toString()).toBe(
    "model-unresolved  flows/main/01-first.md\n"
    + "  Model shared-1 resolves from the assembly rung. The catalog Bot read holds no model of that name under provider faux-b. Run bot model list faux-b to see the names it holds.\n",
  );
});

// The three phrases ticket 0283 deleted. A catalog miss is a catalog miss,
// and nothing here may generalise past it.
test("no model refusal claims retirement or unavailability, in text or in JSON", async () => {
  const { root, home } = await scratch("bot-refusal-no-generalising-");
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { model: no-such-model, reasoning: medium }\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(flow, "01-first.md"), "---\n---\nWrite the first result.\n"),
  ]);
  for (const options of [[], ["--json"]]) {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const { held } = boundary(root, home, stdout, stderr);
    held.models = createModels();
    await expect(main(["run", "start", "review/main", "the request", ...options], held)).resolves.toBe(2);
    const text = Buffer.concat(stderr).toString();
    expect(text).not.toContain("No provider offers");
    expect(text).not.toContain("retired");
    expect(text).not.toContain("unavailable");
  }
});

// The DERIVATION, not the sentence (driver's audit of 0128, kept by 0283).
// Every other fixture in this file builds providers with faux's own auth —
// `resolve` always yields a result, so it is always configured — which makes
// `getProviders()` and `getAvailable()` return the same set. So this fixture
// makes the two sources DISAGREE, using pi's documented "not configured": an
// `ApiKeyAuth.resolve` that yields undefined (auth/types.d.ts). `locked-1`
// resolves out of the catalog and its provider holds no credential, which
// since 0283 is a pre-birth `credential-missing` refusal rather than a stage
// that is born and then dies on the first call.
test("a catalog model whose provider holds no credential refuses before the run is born", async () => {
  const { root, home } = await scratch("bot-refusal-credential-missing-");
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { model: locked-1, reasoning: medium }\n"),
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
  expect(openingCode(Buffer.concat(stderr).toString())).toBe(CREDENTIAL_MISSING);
  expect(Buffer.concat(stderr).toString()).toBe(
    "credential-missing  flows/main/01-first.md\n"
    + "  Model locked-1 resolves from the assembly rung. Provider faux-locked offers it, and Bot found no credential for faux-locked. Run bot auth login faux-locked.\n",
  );
  // No record for a run that could not proceed.
  await expect(readdir(join(home, "runs"))).resolves.toEqual([]);
});

// The four facts reach a program as fields, not only as prose, and an entry
// that has no such fact carries `null` rather than dropping the key.
test("the JSON envelope carries model, provider, rung, cause, and action", async () => {
  const { root, home } = await scratch("bot-refusal-json-facts-");
  const flow = join(home, "assemblies/review/flows/main");
  const longModel = `m${"odel-".repeat(40)}x`;
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), `intelligences:\n  default: { model: ${longModel}, reasoning: medium }\n`),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(flow, "01-first.md"), "---\n---\nWrite the first result.\n"),
  ]);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = boundary(root, home, stdout, stderr);
  held.models = createModels();
  // `--intelligence` on the command line moves the rung, so the field is read
  // off the ladder rather than fixed at whatever the fixture authored.
  await expect(main(["run", "start", "review/main", "--intelligence", "default", "the request", "--json"], held)).resolves.toBe(2);
  const envelope: unknown = JSON.parse(Buffer.concat(stderr).toString());
  const refusals = (envelope as { error: { details: { refusals: Record<string, unknown>[] } } }).error.details.refusals;
  const first = refusals[0];
  if (first === undefined) throw new Error("the envelope carried no refusal");
  expect(Object.keys(first).sort()).toEqual(["action", "cause", "code", "message", "model", "path", "provider", "rung"]);
  expect(first["model"]).toBe(longModel);
  expect(first["provider"]).toBeNull();
  expect(first["rung"]).toBe("command");
  expect(first["cause"]).toBe("model-invalid");
  expect(first["action"]).toBe("Run bot model list to see the names it holds.");
  // The longest model and rung still fit the documented 512-byte bound, so the
  // sentence is the whole sentence and not an ellipsis.
  expect(Buffer.byteLength(String(first["message"]))).toBeLessThanOrEqual(512);
  expect(String(first["message"])).not.toContain("…");
});

// Finding 2 of the review of 0283. The classifier once carried a third shape
// for "no rung names a model", and nothing asserted it, because nothing can
// reach it: a home intelligence row that omits `model` never enters the table,
// so the home read refuses it by name and the node then refuses the
// intelligence. This pins both sentences, and the first one names the exact
// file and the exact row to edit.
test("an intelligence row with no model is refused by name when the home is read", async () => {
  const { root, home } = await scratch("bot-refusal-modelless-row-");
  const flow = join(home, "assemblies/review/flows/main");
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), "intelligences:\n  default: { reasoning: medium }\n"),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\n---\nReview assembly.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(flow, "01-first.md"), "---\n---\nWrite the first result.\n"),
  ]);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = boundary(root, home, stdout, stderr);
  held.models = createModels();
  await expect(main(["run", "start", "review/main", "the request"], held)).resolves.toBe(2);
  expect(Buffer.concat(stderr).toString()).toBe(
    "key-missing  home/config.yaml\n"
    + "  Add the required key model to intelligence default.\n"
    + "intelligence-unresolved  flows/main/01-first.md\n"
    + "  Define an intelligence named default in the home configuration.\n",
  );
  await expect(readdir(join(home, "runs"))).resolves.toEqual([]);
});

// Finding 1 of the review of 0283. `help.ts` promises one bounded result, so
// every field of the envelope is bounded, not only the message and the path.
// An authored model name of four thousand characters reaches `model`, `rung`
// and `action` as well, and each of them is cut to the documented 512 bytes.
test("an oversized authored model name leaves every envelope field bounded", async () => {
  const { root, home } = await scratch("bot-refusal-json-bounds-");
  const flow = join(home, "assemblies/review/flows/main");
  const hugeModel = "m".repeat(4_000);
  await mkdir(flow, { recursive: true });
  await Promise.all([
    writeFile(join(home, "config.yaml"), `intelligences:\n  default: { model: ${hugeModel}, reasoning: medium }\n`),
    writeFile(join(home, "assemblies/review/ASSEMBLY.md"), "---\nintelligence: default\n---\nReview assembly.\n"),
    writeFile(join(flow, "FLOW.md"), "---\ndescription: main flow\n---\n"),
    writeFile(join(flow, "01-first.md"), "---\n---\nWrite the first result.\n"),
  ]);
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = boundary(root, home, stdout, stderr);
  held.models = createModels();
  await expect(main(["run", "start", "review/main", "the request", "--json"], held)).resolves.toBe(2);
  const envelope: unknown = JSON.parse(Buffer.concat(stderr).toString());
  const refusals = (envelope as { error: { details: { refusals: Record<string, unknown>[] } } }).error.details.refusals;
  const first = refusals[0];
  if (first === undefined) throw new Error("the envelope carried no refusal");
  for (const [name, value] of Object.entries(first)) {
    if (value === null) continue;
    expect(typeof value, `field ${name} is neither text nor null`).toBe("string");
    expect(Buffer.byteLength(value as string, "utf8"), `field ${name} is unbounded`).toBeLessThanOrEqual(512);
  }
  // The model field is the one the long name reaches, and it is cut, not dropped.
  expect(String(first["model"]).endsWith("…")).toBe(true);
  expect(String(first["model"]).startsWith("mmmm")).toBe(true);
});

// A refusal that is not a model refusal carries the same keys, all null, so a
// reader may read one shape.
test("a refusal with no model facts carries the five keys as null", async () => {
  const { root, home } = await scratch("bot-refusal-null-facts-");
  await assembly(home);
  await writeFile(join(home, "assemblies/review/flows/main/02-second.md"), "---\n---\n");
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  const { held } = boundary(root, home, stdout, stderr);
  await expect(main(["run", "start", "review/main", "the request", "--json"], held)).resolves.toBe(2);
  const envelope: unknown = JSON.parse(Buffer.concat(stderr).toString());
  const refusals = (envelope as { error: { details: { refusals: Record<string, unknown>[] } } }).error.details.refusals;
  const first = refusals[0];
  if (first === undefined) throw new Error("the envelope carried no refusal");
  expect(first["code"]).toBe("body-missing");
  expect([first["model"], first["provider"], first["rung"], first["cause"], first["action"]]).toEqual([null, null, null, null, null]);
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
