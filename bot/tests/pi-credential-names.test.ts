// Ticket 0288. Pi publishes no list of the environment names its built-in
// providers read: `dist/index.d.ts` exports none, and `dist/env-api-keys.d.ts`
// is internal, reachable only through `./compat`, and partial. This test scans
// the pinned `@earendil-works/pi-ai` package's own `dist/**/*.js` and pins
// CREDENTIAL_ENVIRONMENT_NAMES to what it finds, in both directions, so a Pi
// upgrade that adds, renames, or removes a name fails here while the registry
// in credential-environment.ts is stale.
//
// Extraction rule: a name passed to `env(...)`, `getProviderEnvValue(...)`, or
// `resolveValue(...)`; a name inside an `envApiKeyAuth(label, [...])` array;
// and the constants in `env-api-keys.js` — its object-value map (`provider:
// "NAME"`) and its early-return array (`return ["NAME"]`). A module-level
// string constant is resolved to its value, because `providers/cloudflare-
// auth.js` reads through one. A bare uppercase literal that sits in none of
// these positions is never taken, so incidental strings like `HIGH`, `LOW`,
// `NVIDIA` (a model tier, not an environment name), or an unrelated constant
// declared with `=` stay out.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { CREDENTIAL_ENVIRONMENT_NAMES } from "../src/credential-environment.ts";

const PI_DIST = new URL("../node_modules/@earendil-works/pi-ai/dist/", import.meta.url).pathname;

function jsFiles(root: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...jsFiles(path));
    else if (entry.name.endsWith(".js")) found.push(path);
  }
  return found;
}

const UPPER_NAME = /^[A-Z][A-Z0-9_]*$/u;

/** Resolve a call argument to an environment name: a string literal, or an
 *  identifier that is a module-level string constant (this file's own, or
 *  one imported from env-api-keys.js — every provider that imports one of
 *  its constants imports it under the same name). */
function resolveArgument(raw: string, fileConstants: Map<string, string>, sharedConstants: Map<string, string>): string | undefined {
  const trimmed = raw.trim();
  const literal = trimmed.match(/^["']([A-Za-z0-9_]+)["']$/u);
  if (literal?.[1] && UPPER_NAME.test(literal[1])) return literal[1];
  const identifier = trimmed.match(/^[A-Za-z_$][A-Za-z0-9_$]*$/u);
  if (identifier) return fileConstants.get(trimmed) ?? sharedConstants.get(trimmed);
  return undefined;
}

function moduleConstants(source: string): Map<string, string> {
  const constants = new Map<string, string>();
  const re = /(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*"([A-Za-z0-9_]+)"\s*;/gu;
  for (const match of source.matchAll(re)) {
    const [, id, value] = match;
    if (id && value && UPPER_NAME.test(value)) constants.set(id, value);
  }
  return constants;
}

/** Every quoted uppercase name inside `text`, added to `into`. */
function addQuotedNames(text: string, into: Set<string>): void {
  for (const literal of text.matchAll(/"([A-Za-z0-9_]+)"/gu)) {
    if (literal[1] && UPPER_NAME.test(literal[1])) into.add(literal[1]);
  }
}

/** Names passed to `env(...)`, `getProviderEnvValue(...)`, or
 *  `resolveValue(...)`, plus names inside an `envApiKeyAuth(label, [...])`
 *  array, found in one file's source. */
function callArgumentNames(source: string, fileConstants: Map<string, string>, sharedConstants: Map<string, string>): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(/\b(?:env|getProviderEnvValue|resolveValue)\(\s*([^,)]+)/gu)) {
    const resolved = match[1] ? resolveArgument(match[1], fileConstants, sharedConstants) : undefined;
    if (resolved) names.add(resolved);
  }
  for (const call of source.matchAll(/envApiKeyAuth\([^,]+,\s*\[([^\]]*)\]/gu)) {
    addQuotedNames(call[1] ?? "", names);
  }
  return names;
}

/** The constants in env-api-keys.js: every exported string constant, plus a
 *  quoted uppercase name that sits where the provider -> env-name map inside
 *  getApiKeyEnvVars or the early-return array for github-copilot would put
 *  one — after a `:` (an object value), a `return [` (an array's first
 *  element), or a `,` (a later array element). A constant declared with `=`,
 *  such as an unrelated string like `unrelatedTier`, matches none of these
 *  and is never taken. */
function envApiKeysConstants(source: string, sharedConstants: Map<string, string>): Set<string> {
  const names = new Set<string>(sharedConstants.values());
  for (const match of source.matchAll(/(?::|return\s*\[|,)\s*"([A-Z][A-Z0-9_]*)"/gu)) {
    if (match[1]) names.add(match[1]);
  }
  return names;
}

/** The environment names Pi's pinned `dist/**\/*.js` reads or declares, by
 *  the extraction rule above. */
export function scanPiCredentialNames(root: string): Set<string> {
  const files = jsFiles(root);
  const envApiKeysFile = files.find((file) => file.endsWith("env-api-keys.js"));
  const sharedConstants = envApiKeysFile ? moduleConstants(readFileSync(envApiKeysFile, "utf8")) : new Map<string, string>();
  const names = new Set<string>();

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const name of callArgumentNames(source, moduleConstants(source), sharedConstants)) names.add(name);
  }

  if (envApiKeysFile) {
    const source = readFileSync(envApiKeysFile, "utf8");
    for (const name of envApiKeysConstants(source, sharedConstants)) names.add(name);
  }

  return names;
}

// Bot holds two names Pi never reads. The AWS SDK reads them beneath Pi, in
// `credential-provider-http/dist-es/fromHttp/fromHttp.js`, for the same ECS
// container credential flow Pi's own `AWS_CONTAINER_CREDENTIALS_*_URI` names
// start. Pi itself never calls env/getProviderEnvValue/resolveValue with
// either name, so the scan never finds them; they stay in the registry
// because Bot scrubs and reports on them like every other credential input.
const BOT_ONLY_EXCEPTIONS: Readonly<Record<string, string>> = {
  AWS_CONTAINER_AUTHORIZATION_TOKEN: "the AWS SDK reads it beneath Pi's amazon-bedrock provider, not Pi itself",
  AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE: "the AWS SDK reads it beneath Pi's amazon-bedrock provider, not Pi itself",
};

// Pi reads these but they carry no credential: each toggles a behavior
// (skip a check, force a transport, force a cache duration or retention
// mode) rather than supplying a secret, a profile, a project, a region, or
// a path to one. Bot has no business scrubbing or reporting on a behavior
// flag it never sets.
const PI_ONLY_EXCEPTIONS: Readonly<Record<string, string>> = {
  AWS_BEDROCK_SKIP_AUTH: "a behavior flag, not a credential input",
  AWS_BEDROCK_FORCE_HTTP1: "a behavior flag, not a credential input",
  AWS_BEDROCK_FORCE_CACHE: "a behavior flag, not a credential input",
  AZURE_OPENAI_API_VERSION: "a behavior flag, not a credential input",
  PI_CACHE_RETENTION: "a behavior flag, not a credential input",
};

const PIN_SIZE = 63;

test("the Pi scan yields the count this pin was accepted at", () => {
  const scanned = scanPiCredentialNames(PI_DIST);
  const added = [...scanned].filter((name) => !CREDENTIAL_ENVIRONMENT_NAMES.has(name)).sort();
  const removed = [...CREDENTIAL_ENVIRONMENT_NAMES].filter((name) => !scanned.has(name)).sort();
  const message = `registry has neither seen nor declared: ${JSON.stringify(added)}; scan no longer finds: ${JSON.stringify(removed)}`;
  expect(scanned.size, message).toBe(PIN_SIZE);
});

test("every name Pi's pinned sources read is in the registry, or is a declared Pi-only exception", () => {
  const scanned = scanPiCredentialNames(PI_DIST);
  const missing = [...scanned].filter((name) => !CREDENTIAL_ENVIRONMENT_NAMES.has(name) && !(name in PI_ONLY_EXCEPTIONS));
  expect(missing).toEqual([]);
});

test("every registry name is read by Pi's pinned sources, or is a declared Bot-only exception", () => {
  const scanned = scanPiCredentialNames(PI_DIST);
  const extra = [...CREDENTIAL_ENVIRONMENT_NAMES].filter((name) => !scanned.has(name) && !(name in BOT_ONLY_EXCEPTIONS));
  expect(extra).toEqual([]);
});

test("the exception lists are not stale", () => {
  const scanned = scanPiCredentialNames(PI_DIST);
  for (const name of Object.keys(PI_ONLY_EXCEPTIONS)) {
    expect(scanned.has(name), `${name} is a declared Pi-only exception but the scan no longer finds it`).toBe(true);
  }
  for (const name of Object.keys(BOT_ONLY_EXCEPTIONS)) {
    expect(scanned.has(name), `${name} is a declared Bot-only exception but the scan now finds it in Pi`).toBe(false);
  }
});
