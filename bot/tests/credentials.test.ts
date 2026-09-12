// Ticket 0012: conforming CredentialStore over a scratch credential file.
// Scratch files only — never the real ~/.pi/agent/auth.json or any real
// credential. Lock-contention tests hold proper-lockfile from a child
// process exactly the way pi-coding-agent does.
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { createModels, type Models } from "@earendil-works/pi-ai";
import { fileCredentialStore } from "../src/credentials.ts";
import { credentialPath, resolveHome, scratchRoot } from "../src/invocation.ts";
import type { DriverClock } from "../src/process.ts";
import { runtimeModels, type RunDependencies } from "../src/run.ts";

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

async function scratch(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "bot-credentials-"));
  roots.push(root);
  return join(root, "auth.json");
}

const oauth = (refresh: string, access: string, expires = 4102444800000) =>
  ({ type: "oauth", refresh, access, expires }) as const;

test("read and list resolve undefined/empty for a missing file and missing provider", async () => {
  const store = fileCredentialStore(await scratch(), clock);
  await expect(store.read("anthropic")).resolves.toBeUndefined();
  await expect(store.list()).resolves.toEqual([]);
});

test("read and list surface stored credentials without secrets in list", async () => {
  const path = await scratch();
  await writeFile(path, JSON.stringify({
    "openai-codex": oauth("r0", "a0"),
    anthropic: { type: "api_key", key: "sk-scratch", env: { REGION: "eu" } },
  }));
  const store = fileCredentialStore(path, clock);
  await expect(store.read("openai-codex")).resolves.toEqual(oauth("r0", "a0"));
  await expect(store.read("anthropic")).resolves.toEqual({ type: "api_key", key: "sk-scratch", env: { REGION: "eu" } });
  await expect(store.read("missing")).resolves.toBeUndefined();
  await expect(store.list()).resolves.toEqual([
    { providerId: "openai-codex", type: "oauth" },
    { providerId: "anthropic", type: "api_key" },
  ]);
});

// The sentence is the STORE's, at the store's own seam (ticket 0144's audit):
// a file that will not parse says so in the same family as a file that parses
// to the wrong shape, so bot's own torn credential file reads the same way to
// every caller and Node's parse error reaches nobody.
test("malformed JSON rejects read, list, and modify honestly, in the store's own sentence", async () => {
  const path = await scratch();
  await writeFile(path, "not json {{");
  const store = fileCredentialStore(path, clock);
  await expect(store.read("anthropic")).rejects.toThrow(`Credential file ${path} is not JSON.`);
  await expect(store.list()).rejects.toThrow(`Credential file ${path} is not JSON.`);
  await expect(store.modify("anthropic", () => Promise.resolve(undefined))).rejects.toThrow(`Credential file ${path} is not JSON.`);
});

test("an un-shaped credential rejects instead of guessing", async () => {
  const path = await scratch();
  await writeFile(path, JSON.stringify({ prov: { type: "oauth", refresh: "r0" } }));
  const store = fileCredentialStore(path, clock);
  await expect(store.read("prov")).rejects.toThrow(/not a pi-ai credential shape/u);
  await writeFile(path, JSON.stringify({ prov: "sk-bare-string" }));
  await expect(store.list()).rejects.toThrow(/not a pi-ai credential shape/u);
  await writeFile(path, JSON.stringify(["not", "a", "mapping"]));
  await expect(store.read("prov")).rejects.toThrow(/JSON object of providers/u);
});

test("modify persists the returned credential at mode 0600, creating a missing file", async () => {
  const path = await scratch();
  const store = fileCredentialStore(path, clock);
  const written = await store.modify("prov", (current) => {
    expect(current).toBeUndefined();
    return Promise.resolve(oauth("r0", "a0"));
  });
  expect(written).toEqual(oauth("r0", "a0"));
  expect((await stat(path)).mode & 0o777).toBe(0o600);
  await expect(store.read("prov")).resolves.toEqual(oauth("r0", "a0"));
});

// LEG 1 (ticket 0144) — the store's own directory. Bot's credential file lives
// at a path nothing else creates, so the first write settles it: born
// owner-only like the home, and settled before the lock, which is what wants
// the directory first. Nothing here touches a real `~/.config` — the whole tree
// is under the test's own scratch.
test("the first write makes the credential directory, owner-only, and the file beneath it 0600", async () => {
  const root = await mkdtemp(join(tmpdir(), "bot-credentials-xdg-"));
  roots.push(root);
  const directory = join(root, "config", "bot");
  const path = join(directory, "credentials.json");
  const store = fileCredentialStore(path, clock);
  // Absent reads as no stored credentials, so a run against a machine that has
  // never logged in never refuses.
  await expect(store.read("prov")).resolves.toBeUndefined();
  await expect(store.list()).resolves.toEqual([]);
  await store.modify("prov", () => Promise.resolve(oauth("r0", "a0")));
  expect((await stat(directory)).mode & 0o777).toBe(0o700);
  expect((await stat(path)).mode & 0o777).toBe(0o600);
  await expect(store.read("prov")).resolves.toEqual(oauth("r0", "a0"));
});

test("modify whose fn returns undefined leaves the file untouched and resolves the current credential", async () => {
  const path = await scratch();
  await writeFile(path, JSON.stringify({ prov: oauth("r0", "a0") }));
  const before = await readFile(path, "utf8");
  const store = fileCredentialStore(path, clock);
  await expect(store.modify("prov", () => Promise.resolve(undefined))).resolves.toEqual(oauth("r0", "a0"));
  await expect(readFile(path, "utf8")).resolves.toBe(before);
});

// Ticket 0029 item 7 (B5): the write is temp-file + rename in the SAME
// directory — a lockless reader never sees a torn file, and the rotation
// lands even when the old file's own bytes cannot be opened for writing.
test("the credential write is atomic: a new inode replaces the file rather than rewriting its bytes", async () => {
  const path = await scratch();
  await writeFile(path, JSON.stringify({ prov: oauth("r0", "a0") }));
  const before = await stat(path);
  await chmod(path, 0o400);
  const store = fileCredentialStore(path, clock);
  await expect(store.modify("prov", () => Promise.resolve(oauth("r1", "a1")))).resolves.toEqual(oauth("r1", "a1"));
  const after = await stat(path);
  expect(after.ino).not.toBe(before.ino);
  expect(after.mode & 0o777).toBe(0o600);
  await expect(store.read("prov")).resolves.toEqual(oauth("r1", "a1"));
});

test("delete removes a credential and tolerates an absent one", async () => {
  const path = await scratch();
  await writeFile(path, JSON.stringify({ prov: oauth("r0", "a0"), keep: { type: "api_key", key: "k" } }));
  const store = fileCredentialStore(path, clock);
  await store.delete("prov");
  await expect(store.read("prov")).resolves.toBeUndefined();
  await expect(store.read("keep")).resolves.toEqual({ type: "api_key", key: "k" });
  await store.delete("prov");
  await expect(store.list()).resolves.toEqual([{ providerId: "keep", type: "api_key" }]);
});

test("interleaved in-process modify calls serialize: the second sees the first's rotation", async () => {
  const path = await scratch();
  await writeFile(path, JSON.stringify({ prov: oauth("r0", "a0") }));
  const store = fileCredentialStore(path, clock);
  const seen: string[] = [];
  const first = store.modify("prov", async (current) => {
    await new Promise((wake) => setTimeout(wake, 30));
    seen.push(`first:${current?.type === "oauth" ? current.refresh : "?"}`);
    return oauth("r1", "a1");
  });
  const second = store.modify("prov", (current) => {
    seen.push(`second:${current?.type === "oauth" ? current.refresh : "?"}`);
    return Promise.resolve(oauth("r2", "a2"));
  });
  await Promise.all([first, second]);
  expect(seen).toEqual(["first:r0", "second:r1"]);
  await expect(store.read("prov")).resolves.toEqual(oauth("r2", "a2"));
});

test("forced refresh under cross-process contention: modify waits for the file lock and never clobbers", async () => {
  const path = await scratch();
  await writeFile(path, JSON.stringify({ prov: oauth("r0", "a0") }));
  // The child holds proper-lockfile exactly as pi-coding-agent does
  // (lockSync, realpath false), rotates the credential to r1 while holding
  // it, then releases ~100ms later. A non-waiting modify would read r0 and
  // clobber the rotation.
  const child = spawn(process.execPath, ["-e", `
    const { lockSync } = require("proper-lockfile");
    const { writeFileSync } = require("node:fs");
    const path = process.env.SCRATCH_AUTH;
    const release = lockSync(path, { realpath: false });
    console.log("locked");
    setTimeout(() => {
      writeFileSync(path, JSON.stringify({ prov: { type: "oauth", refresh: "r1", access: "a1", expires: 4102444800000 } }, null, 2));
      release();
    }, 100);
  `], { cwd: join(import.meta.dirname, ".."), env: { ...process.env, SCRATCH_AUTH: path } });
  // The close listener attaches AT SPAWN (ticket 0025): 'close' fires once,
  // ~when modify finishes — a listener attached afterward misses it and the
  // test hangs to its timeout. That race was the whole flake; the lock
  // protocol is healthy — acquire is 112ms median, 157ms worst against a 1s
  // retry budget (41 samples under full-suite load, 2026-08-06, ticket 0160).
  const closed = new Promise((done) => child.on("close", done));
  await new Promise<void>((locked, failed) => {
    child.stdout.on("data", (bytes: Buffer) => { if (bytes.toString().includes("locked")) locked(); });
    child.on("error", failed);
  });
  const store = fileCredentialStore(path, clock);
  const started = performance.now();
  const rotated = await store.modify("prov", (current) => {
    if (current?.type !== "oauth") throw new Error("expected the child's rotation");
    // Re-read under the lock saw the child's write — the no-clobber proof.
    expect(current.refresh).toBe("r1");
    return Promise.resolve({ ...current, refresh: `${current.refresh}-rotated` });
  });
  expect(performance.now() - started).toBeGreaterThan(50);
  expect(rotated?.type === "oauth" && rotated.refresh).toBe("r1-rotated");
  const persisted: unknown = JSON.parse(await readFile(path, "utf8"));
  expect(persisted).toEqual({ prov: { ...oauth("r1-rotated", "a1"), expires: 4102444800000 } });
  await closed;
});

// REDESIGN (ticket 0144): this test pinned "the store is wired only when
// BOT_AUTH is set and non-empty", and BOT_AUTH is retired entirely (ADR 0017).
// The claim it is redesigned into is the opposite one and is stronger: the
// store is ALWAYS wired, on a path derived from the snapshot, and the planted
// BOT_AUTH is IGNORED — which is the retirement's own witness. Nothing was
// weakened: the injected-models arm is kept, and the arm that proved a
// non-wired runtime does not answer with the file's key is kept as the
// XDG-elsewhere arm, where a store wired to the WRONG path is what must not
// answer with it.
test("the compatibility runtime preserves environment auth and ignores every retired Bot-store spelling", async () => {
  const path = await scratch();
  const config = join(dirname(path), "config");
  await mkdir(join(config, "bot"), { recursive: true });
  await writeFile(join(config, "bot", "credentials.json"), JSON.stringify({ anthropic: { type: "api_key", key: "sk-bot-wiring-test" } }));
  const dependencies = (env: NodeJS.ProcessEnv, models?: Models): RunDependencies =>
    ({ clock, cwd: "/", env, progress: () => undefined, ...(models === undefined ? {} : { models }) });
  // The old file exists, but only the supported environment source reaches
  // this compatibility runtime.
  const wired = runtimeModels(dependencies({ XDG_CONFIG_HOME: config, ANTHROPIC_API_KEY: "sk-from-the-environment-not-the-file" }));
  const auth = await wired.getAuth("anthropic");
  expect(auth?.auth.apiKey).toBe("sk-from-the-environment-not-the-file");
  const planted = runtimeModels(dependencies({ BOT_AUTH: join(config, "bot", "credentials.json"), XDG_CONFIG_HOME: dirname(path) }));
  expect(await planted.getAuth("anthropic")).toBeUndefined();
  const supplied = createModels();
  expect(runtimeModels(dependencies({ XDG_CONFIG_HOME: config }, supplied))).toBe(supplied);
});

// LEG 1 — one derivation, from the boundary snapshot and nothing else. The
// three XDG variables answer by one rule, so a relative value is invalid and
// ignored in all three (the basedir specification's own wording), and nothing
// here touches a real `~/.config`: every value is an injected string and the
// function computes a path rather than reading one.
test("the credential file is XDG_CONFIG_HOME/bot/credentials.json, and a relative XDG value is treated as unset", () => {
  expect(credentialPath({ XDG_CONFIG_HOME: "/named/config", HOME: "/home/x" })).toBe("/named/config/bot/credentials.json");
  expect(credentialPath({ HOME: "/home/x" })).toBe("/home/x/.config/bot/credentials.json");
  expect(credentialPath({ XDG_CONFIG_HOME: "relative/config", HOME: "/home/x" })).toBe("/home/x/.config/bot/credentials.json");
  // The same rule, in the two derivations that were here before it (CHECKLIST 9).
  expect(scratchRoot({ XDG_CACHE_HOME: "relative/cache", HOME: "/home/x" })).toBe("/home/x/.cache/bot/tmp");
  expect(resolveHome("/", undefined, { XDG_DATA_HOME: "relative/data", HOME: "/home/x" })).toBe("/home/x/.local/share/bot");
});
