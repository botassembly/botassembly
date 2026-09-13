// Ticket 0139 legs 1 and 3 — the environment bot resolves auth from is bot's
// own snapshot, and the two names that are the runtime's leave the live process
// at the door.
//
// Ian's ruling, carried by the ticket: env-var auth is KEPT but SCRUBBED.
// A documented provider key keeps working exactly as documented — through
// bot's snapshot — while Pi's ambient sniffing of `process.env` and its probes
// for credential files on disk die. Nothing here writes a credential, prints a
// token, or reads the real home: every value below is a stand-in, and the only
// file that exists is an empty one in the test's own scratch.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultProviderAuthContext } from "@earendil-works/pi-ai";
import { afterEach, expect, test, vi } from "vitest";
import { processBoundary } from "../src/cli.ts";
import { scrubCredentialEnvironment, snapshotAuthContext } from "../src/credentials.ts";
import { runtimeModels } from "../src/run.ts";
import type { DriverClock } from "../src/process.ts";

const roots: string[] = [];
const clock: DriverClock = {
  milliseconds: () => performance.now(),
  timestamp: () => new Date().toISOString(),
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimeout: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>); },
};

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** Not a credential: a documented provider key name carrying a stand-in. */
const AMBIENT = "ambient-value-not-a-credential";
const SNAPSHOT = "snapshot-value-not-a-credential";

const BUILTIN_CREDENTIAL_ENVIRONMENT = [
  "AI_GATEWAY_API_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_OAUTH_TOKEN", "ANT_LING_API_KEY",
  "AWS_ACCESS_KEY_ID", "AWS_BEARER_TOKEN_BEDROCK", "AWS_CONTAINER_AUTHORIZATION_TOKEN", "AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE",
  "AWS_CONTAINER_CREDENTIALS_FULL_URI", "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI", "AWS_PROFILE", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN",
  "AWS_WEB_IDENTITY_TOKEN_FILE", "AZURE_OPENAI_API_KEY", "BASETEN_API_KEY", "CEREBRAS_API_KEY", "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_KEY", "CLOUDFLARE_GATEWAY_ID", "COPILOT_GITHUB_TOKEN", "DEEPSEEK_API_KEY", "FIREWORKS_API_KEY", "GCLOUD_PROJECT",
  "GEMINI_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_CLOUD_API_KEY", "GOOGLE_CLOUD_LOCATION", "GOOGLE_CLOUD_PROJECT", "GROQ_API_KEY",
  "HF_TOKEN", "KIMI_API_KEY", "MINIMAX_API_KEY", "MINIMAX_CN_API_KEY", "MISTRAL_API_KEY", "MOONSHOT_API_KEY", "NVIDIA_API_KEY",
  "OPENAI_API_KEY", "OPENCODE_API_KEY", "OPENROUTER_API_KEY", "QWEN_TOKEN_PLAN_API_KEY", "QWEN_TOKEN_PLAN_CN_API_KEY", "RADIUS_API_KEY",
  "TOGETHER_API_KEY", "XAI_API_KEY", "XIAOMI_API_KEY", "XIAOMI_TOKEN_PLAN_AMS_API_KEY", "XIAOMI_TOKEN_PLAN_CN_API_KEY",
  "XIAOMI_TOKEN_PLAN_SGP_API_KEY", "ZAI_API_KEY", "ZAI_CODING_CN_API_KEY",
] as const;

// Since ticket 0144 the credential store is wired ALWAYS, on the path the
// snapshot's `XDG_CONFIG_HOME` gives (ADR 0017) — so every environment here
// names one, and names a directory that does not exist: the real `~/.config`
// must never be a candidate in a test, and an absent file reading as no stored
// credentials is exactly the state these four are about.
const NO_CONFIG_HOME = join(tmpdir(), "bot-auth-snapshot-no-config-home");

function providersOf(env: NodeJS.ProcessEnv): Promise<string[]> {
  const models = runtimeModels({ clock, cwd: "/", env: { XDG_CONFIG_HOME: NO_CONFIG_HOME, ...env }, progress: () => undefined });
  return models.getAvailable().then((held) => [...new Set(held.map((model) => model.provider))]);
}

test("every built-in Pi credential environment name is removed from a stage environment", () => {
  const planted = Object.fromEntries(BUILTIN_CREDENTIAL_ENVIRONMENT.map((name) => [name, SNAPSHOT]));
  expect(scrubCredentialEnvironment(planted)).toEqual({});
});

// LEG 1. `processBoundary` took a REFERENCE to `process.env` — no snapshot at
// all — so there was nothing "after the snapshot" for a deletion to happen
// after. It copies now, and the copy is what every rung reads, so BOT_HOME
// keeps resolving the home while the live process the run shares with Pi holds
// it no longer.
//
// REDESIGN (ticket 0144): this test asserted that BOT_AUTH left the live
// process too. BOT_AUTH is retired entirely (ADR 0017) — bot reads no such
// variable — and a variable bot does not read is not bot's to scrub, so the
// deletion had to go and the assertion is INVERTED rather than dropped. The
// scrub's own claim is stronger for it: BOT_HOME is now genuinely the one
// variable, and this test fails if a second one is ever deleted quietly.
test("the process boundary snapshots the environment and takes BOT_HOME, and only BOT_HOME, out of the live process", () => {
  vi.stubEnv("BOT_HOME", "/planted/leaky/home");
  vi.stubEnv("BOT_AUTH", "/planted/retired/auth.json");
  vi.stubEnv("BOT_KEPT_PROBE", "stays");
  // The premise, asserted rather than assumed: both names are live right now.
  expect(process.env["BOT_HOME"]).toBe("/planted/leaky/home");
  expect(process.env["BOT_AUTH"]).toBe("/planted/retired/auth.json");

  const boundary = processBoundary();

  expect(boundary.env["BOT_HOME"]).toBe("/planted/leaky/home");
  expect(process.env["BOT_HOME"]).toBeUndefined();
  // ONE name, not two and not the environment: the retired variable is left
  // exactly where it was found, and everything else is still there, in the
  // process and in the snapshot alike.
  expect(process.env["BOT_AUTH"]).toBe("/planted/retired/auth.json");
  expect(process.env["BOT_KEPT_PROBE"]).toBe("stays");
  expect(boundary.env["BOT_KEPT_PROBE"]).toBe("stays");
  // A snapshot, not an alias: a later change to the live process is not the
  // run's to see.
  vi.stubEnv("BOT_KEPT_PROBE", "changed after the door");
  expect(boundary.env["BOT_KEPT_PROBE"]).toBe("stays");
});

// LEG 3, the two halves of the injected context, against Pi's own default so
// the difference is witnessed rather than described. `fileExists` is asked
// about a file that REALLY EXISTS, in the test's own scratch — the default
// says yes, bot's says no — because "always false" is only a claim if the
// answer could have been true.
test("bot's auth context reads the snapshot and answers no to every file, where pi's default reads the machine", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-auth-context-"));
  roots.push(root);
  const real = join(root, "credentials.json");
  await writeFile(real, "{}\n");
  vi.stubEnv("GROQ_API_KEY", AMBIENT);

  const ambient = defaultProviderAuthContext();
  await expect(ambient.env("GROQ_API_KEY")).resolves.toBe(AMBIENT);
  await expect(ambient.fileExists(real)).resolves.toBe(true);

  const held = snapshotAuthContext({ GROQ_API_KEY: SNAPSHOT, BLANK_PROBE: "   " });
  await expect(held.env("GROQ_API_KEY")).resolves.toBe(SNAPSHOT);
  await expect(held.fileExists(real)).resolves.toBe(false);
  // Pi's own emptiness rule, kept: a blank value is not a configured one.
  await expect(held.env("BLANK_PROBE")).resolves.toBeUndefined();
  await expect(held.env("NEVER_SET_PROBE")).resolves.toBeUndefined();
});

// LEG 3 at the seam that matters: `getAvailable()` is what ticket 0128 made the
// source of truth for "the providers configured here", and it must answer from
// the snapshot. Groq is a documented env-key provider (GROQ_API_KEY), so this
// is ruling 1 whole: the key in the snapshot configures the provider, the same
// key ambient in the process does not.
test("getAvailable answers from the injected environment: a documented provider key works, the same key ambient does not", async () => {
  vi.stubEnv("GROQ_API_KEY", AMBIENT);
  await expect(providersOf({})).resolves.not.toContain("groq");
  await expect(providersOf({ GROQ_API_KEY: SNAPSHOT })).resolves.toContain("groq");
});

// LEG 3's file half, at the same seam. Vertex is the provider whose api-key
// auth is a FILE probe: with a project and a location it reports configured
// when the application-default-credentials file exists (pi-ai's google-vertex
// provider asks its auth context, not the disk). The probe is pointed at a
// file that exists, in the test's own scratch, so a context that answered
// honestly would say configured — and bot's says no, which is the ambient
// gcloud probe dying.
test("the ambient credential-file probe finds nothing, even when the file it names is really there", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-auth-vertex-"));
  roots.push(root);
  const adc = join(root, "application_default_credentials.json");
  await writeFile(adc, "{}\n");
  const trio = {
    GOOGLE_APPLICATION_CREDENTIALS: adc,
    GOOGLE_CLOUD_PROJECT: "bot-test-project",
    GOOGLE_CLOUD_LOCATION: "us-central1",
  };
  // The premise: this trio IS how that provider reports itself configured —
  // pi's default context, over the very same names, says so.
  vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", adc);
  vi.stubEnv("GOOGLE_CLOUD_PROJECT", trio.GOOGLE_CLOUD_PROJECT);
  vi.stubEnv("GOOGLE_CLOUD_LOCATION", trio.GOOGLE_CLOUD_LOCATION);
  const ambient = defaultProviderAuthContext();
  await expect(ambient.fileExists(adc)).resolves.toBe(true);
  await expect(ambient.env("GOOGLE_CLOUD_PROJECT")).resolves.toBe(trio.GOOGLE_CLOUD_PROJECT);

  await expect(providersOf({})).resolves.not.toContain("google-vertex");
  await expect(providersOf(trio)).resolves.not.toContain("google-vertex");
});
