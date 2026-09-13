import { chmod, link, mkdir, mkdtemp, readFile, rename as realRename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fauxProvider, type Provider } from "@earendil-works/pi-ai";
import { afterEach, expect, test, vi } from "vitest";
import { main, type CliBoundary } from "../src/cli.ts";
import { CLI_CONTRACTS } from "../src/cli-contract.ts";
import { fileCredentialStore } from "../src/credentials.ts";
import { mapping } from "../src/model.ts";
import { manualClock } from "./manual-clock.ts";
import { nativeModelRuntime } from "./support/native-model-runtime.ts";

const injected = vi.hoisted(() => ({
  source: "", destination: "", sourceDir: "", agentDir: "", temporary: "", committed: false,
  failure: "", destinationBarrier: false, destinationHeld: undefined as undefined | (() => void),
  destinationEntered: undefined as undefined | (() => void),
  compromise: undefined as undefined | (() => void), events: undefined as undefined | string[],
}));

function failed(name: string): Error & { code: string } {
  return Object.assign(new Error(`${name}: secret operating-system detail`), { code: "EIO" });
}

vi.mock("proper-lockfile", async (importOriginal) => {
  const original = await importOriginal<typeof import("proper-lockfile")>();
  const captureCompromise = (path: string, options: Parameters<typeof original.lock>[1]): void => {
    if (path === injected.destination) {
      injected.compromise = () => { options?.onCompromised?.(
        Object.assign(new Error("late compromise"), { code: "ECOMPROMISED" }),
      ); };
    }
  };
  return {
    ...original,
    lock: async (...args: Parameters<typeof original.lock>) => {
      if (args[0] === injected.destination && injected.failure === "destination-lock") {
        throw Object.assign(new Error("locked secret"), { code: "ELOCKED" });
      }
      const release = await original.lock(...args);
      captureCompromise(args[0], args[1]);
      if (args[0] === injected.destination && injected.failure === "destination-compromise") {
        await release();
        args[1]?.onCompromised?.(Object.assign(new Error("destination lock compromised"), { code: "ECOMPROMISED" }));
        return () => Promise.resolve();
      }
      if (args[0] === injected.destination && injected.destinationBarrier) {
        injected.destinationEntered?.();
        await new Promise<void>((resolve) => { injected.destinationHeld = resolve; });
      }
      return async () => {
        await release();
        if (args[0] === injected.destination && injected.failure === "destination-release") {
          throw failed("destination release");
        }
      };
    },
    lockSync: (...args: Parameters<typeof original.lockSync>) => {
      if (args[0] === injected.source && injected.failure === "source-lock") {
        throw Object.assign(new Error("source locked secret"), { code: "ELOCKED" });
      }
      return original.lockSync(...args);
    },
  };
});

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  const role = (path: string): string => path === injected.source ? "source" : path === injected.destination ? "destination"
    : path === injected.sourceDir ? "source-directory" : path === injected.agentDir ? "destination-directory"
      : path.includes(".bot-auth-import-") ? "temporary" : "other";
  const changedMetadata = <T extends { uid: number | bigint; gid: number | bigint; ino: number | bigint }>(held: T, name: string): T =>
    new Proxy(held, { get(target, property) {
      if (property === "uid" && injected.failure === `${name}-owner`) return typeof target.uid === "bigint" ? target.uid + 1n : target.uid + 1;
      if (property === "gid" && injected.failure === `${name}-group-changed`) return typeof target.gid === "bigint" ? target.gid + 1n : target.gid + 1;
      if (property === "ino" && injected.failure === `${name}-identity-changed`) return typeof target.ino === "bigint" ? target.ino + 1n : target.ino + 1;
      return Reflect.get(target, property, target);
    } });
  return {
    ...original,
    lstat: async (...args: Parameters<typeof original.lstat>) => {
      if (injected.events !== undefined && !injected.events.includes("filesystem")) injected.events.push("filesystem");
      const held = await original.lstat(...args), name = role(args[0].toString());
      return changedMetadata(held, name);
    },
    open: async (...args: Parameters<typeof original.open>) => {
      const path = args[0].toString(), held = await original.open(...args), name = role(path);
      if (name === "temporary") injected.temporary = path;
      return new Proxy(held, { get(target, property) {
        const value = Reflect.get(target, property, target) as unknown;
        if (property === "readFile" || property === "read") return (...call: unknown[]) => {
          if (injected.failure === `late-${name}` || injected.failure === `late-${name}-read`) injected.compromise?.();
          return injected.failure === `${name}-read` || injected.failure === `late-${name}-read`
            ? Promise.reject(failed(`${name} read`)) : Promise.resolve((value as (...inner: unknown[]) => unknown).apply(target, call));
        };
        if (property === "writeFile" || property === "write") return (...call: unknown[]) => injected.failure === `${name}-write`
          ? Promise.reject(failed(`${name} write`)) : Promise.resolve((value as (...inner: unknown[]) => unknown).apply(target, call));
        if (property === "sync") return (...call: unknown[]) => injected.failure === `${name}-sync`
          ? Promise.reject(failed(`${name} sync`)) : Promise.resolve((value as (...inner: unknown[]) => unknown).apply(target, call));
        if (property === "stat") return async (...call: unknown[]) => {
          const held = await (value as (...inner: unknown[]) => Promise<Record<string, unknown>>).apply(target, call);
          return changedMetadata(held as { uid: number; gid: number; ino: number }, name);
        };
        if (property === "close") return (...call: unknown[]) => {
          const suffix = injected.committed ? "post-close" : "close";
          const closing = Promise.resolve((value as (...inner: unknown[]) => unknown).apply(target, call));
          return injected.failure === `${name}-${suffix}` ? closing.then(() => Promise.reject(failed(`${name} close`))) : closing;
        };
        // The proxy must preserve non-intercepted FileHandle fields and methods.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return typeof value === "function" ? value.bind(target) : value;
      } });
    },
    rename: async (...args: Parameters<typeof original.rename>) => {
      if (args[1].toString() === injected.destination && injected.failure === "rename") throw failed("rename");
      await original.rename(...args);
      if (args[1].toString() === injected.destination) injected.committed = true;
    },
    unlink: async (...args: Parameters<typeof original.unlink>) => {
      if (role(args[0].toString()) === "temporary" && injected.failure === "cleanup") throw failed("cleanup");
      await original.unlink(...args);
    },
  };
});

interface Place { root: string; sourceDir: string; source: string; agentDir: string; destination: string }
interface ImportBoundary extends CliBoundary {
  afterAuthImportDestinationLock?: (input: { temporary?: string }) => void | Promise<void>;
  afterAuthImportSourceLock?: (input: { temporary?: string }) => void | Promise<void>;
  beforeAuthImportRename?: (input: { temporary: string }) => void | Promise<void>;
  afterAuthImportResultPreflight?: (input: { maximumBytes: number }) => void | Promise<void>;
  afterAuthImportResultPrepared?: (input: { output: Buffer }) => void | Promise<void>;
}
interface Invocation { code: number; out: string; err: string }

const roots: string[] = [];
const SECRET = "durability-secret-must-never-print";

afterEach(async () => {
  Object.assign(injected, { source: "", destination: "", sourceDir: "", agentDir: "", temporary: "", committed: false,
    failure: "", destinationBarrier: false, destinationHeld: undefined, destinationEntered: undefined,
    compromise: undefined, events: undefined });
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function place(source = `{"one":{"type":"api_key","key":"${SECRET}"}}`, destination?: string): Promise<Place> {
  const root = await mkdtemp(join(tmpdir(), "bot-auth-import-durability-")); roots.push(root);
  const sourceDir = join(root, "retired"), agentDir = join(root, "pi-agent");
  const held = { root, sourceDir, source: join(sourceDir, "credentials.json"), agentDir, destination: join(agentDir, "auth.json") };
  await mkdir(sourceDir, { mode: 0o700 }); await mkdir(agentDir, { mode: 0o700 });
  await writeFile(held.source, source, { mode: 0o600 });
  if (destination !== undefined) await writeFile(held.destination, destination, { mode: 0o600 });
  Object.assign(injected, held, { failure: "" });
  return held;
}

async function invoke(where: Place, extra: Partial<ImportBoundary> = {}): Promise<Invocation> {
  const out: Buffer[] = [], err: Buffer[] = [];
  let now = 0;
  const boundary: ImportBoundary = {
    cwd: where.root, env: {}, stdinIsTTY: true, stderrIsTTY: false, authPath: where.destination,
    retiredCredentialPath: where.source,
    readStdin: () => Promise.resolve(Buffer.alloc(0)), stdout: (bytes) => { out.push(Buffer.from(bytes)); },
    stderr: (bytes) => { err.push(Buffer.from(bytes)); },
    clock: { milliseconds: () => now, timestamp: () => "2026-09-11T00:00:00.000Z",
      setTimeout: (callback, milliseconds) => { now += milliseconds; return setImmediate(callback); },
      clearTimeout: (handle) => { clearImmediate(handle as ReturnType<typeof setImmediate>); } },
    ...extra,
  };
  const code = await main(["auth", "import", where.source, "--json"], boundary);
  return { code, out: Buffer.concat(out).toString(), err: Buffer.concat(err).toString() };
}

function object(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (!mapping(value)) throw new Error("Expected an object.");
  return value;
}

function success(count = 1): string {
  return `${JSON.stringify({ schemaVersion: 1, kind: "bot.auth.import", data: { imported: count > 0, providerCount: count } })}\n`;
}

const MESSAGES: Record<string, string> = {
  "source-changed": "The credential import source changed during import.",
  "destination-changed": "The Pi authentication destination changed during import.",
  "temporary-changed": "The credential import temporary file changed during import.",
  "import-busy": "Credential import could not acquire its file locks.",
  "source-read-failed": "The credential import source could not be read safely.",
  "destination-read-failed": "The Pi authentication destination could not be read safely.",
  "import-write-failed": "Credential import could not publish Pi authentication.",
  "import-cleanup-failed": "Credential import stopped before publication and could not remove its temporary file.",
};

function expectsFailure(result: Invocation, cause: string, code = "dependency-failed", path?: string): void {
  expect(result).toEqual({ code: code === "integrity-failed" ? 5 : 4, out: "", err: `${JSON.stringify({
    schemaVersion: 1, kind: "error", error: { code, operation: "auth.import", cause, message: MESSAGES[cause],
      retryable: code === "dependency-failed", details: path === undefined ? {} : { path } },
  })}\n` });
  expect(result.out + result.err).not.toContain(SECRET);
}

test.each([["source-owner", "source-invalid"], ["destination-owner", "destination-invalid"]] as const)(
  "foreign %s metadata refuses through the exact trust cause", async (failure, cause) => {
    const where = await place(undefined, failure === "destination-owner" ? "{}" : undefined); injected.failure = failure;
    const result = await invoke(where);
    expect(result).toMatchObject({ code: 5, out: "" });
    expect(object(result.err)).toMatchObject({ error: { operation: "auth.import", code: "integrity-failed", cause,
      retryable: false, details: { path: failure === "source-owner" ? where.source : where.destination } } });
  },
);

test.each([
  ["destination-lock", "import-busy"], ["destination-compromise", "import-busy"], ["source-lock", "import-busy"],
  ["source-read", "source-read-failed"], ["destination-read", "destination-read-failed"],
  ["temporary-write", "import-write-failed"], ["temporary-sync", "import-write-failed"],
  ["temporary-close", "import-write-failed"], ["rename", "import-write-failed"],
] as const)("pre-commit injected %s emits the exhaustive %s settlement", async (failure, cause) => {
  const where = await place(undefined, failure === "destination-read" ? "{}" : undefined);
  injected.failure = failure;
  const before = await readFile(where.source), result = await invoke(where);
  expectsFailure(result, cause, "dependency-failed",
    cause === "source-read-failed" ? where.source : cause === "destination-read-failed" ? where.destination : undefined);
  expect(await readFile(where.source)).toEqual(before);
  if (failure !== "destination-read") await expect(readFile(where.destination)).rejects.toMatchObject({ code: "ENOENT" });
});

test.each([
  ["late-source", "{}", undefined],
  ["late-destination", undefined, `{"kept":{"type":"api_key"}}`],
  ["late-source-read", undefined, undefined],
] as const)("a %s compromise supersedes every uncommitted terminal settlement", async (failure, source, destination) => {
  const where = await place(source, destination); injected.failure = failure;
  expectsFailure(await invoke(where), "import-busy");
});

test("cleanup failure supersedes a pre-commit write failure and leaves no false success", async () => {
  const where = await place(); injected.failure = "temporary-write";
  const result = await invoke(where, { beforeAuthImportRename: () => { injected.failure = "cleanup"; } });
  expectsFailure(result, "import-cleanup-failed", "dependency-failed", injected.temporary);
});

test("source and destination replacements at both barriers use changed causes", async () => {
  const sourceAfterPreflight = await place(), replacement = join(sourceAfterPreflight.sourceDir, "replacement");
  await writeFile(replacement, "{}", { mode: 0o600 });
  const first = await invoke(sourceAfterPreflight, { afterAuthImportDestinationLock: async () => {
    await realRename(sourceAfterPreflight.source, `${sourceAfterPreflight.source}.old`); await realRename(replacement, sourceAfterPreflight.source);
  } });
  expectsFailure(first, "source-changed", "dependency-failed", sourceAfterPreflight.source);

  const sourceAfterLock = await place(), secondReplacement = join(sourceAfterLock.sourceDir, "replacement");
  await writeFile(secondReplacement, "{}", { mode: 0o600 });
  const second = await invoke(sourceAfterLock, { afterAuthImportSourceLock: async () => {
    await realRename(sourceAfterLock.source, `${sourceAfterLock.source}.old`); await realRename(secondReplacement, sourceAfterLock.source);
  } });
  expectsFailure(second, "source-changed", "dependency-failed", sourceAfterLock.source);

  const destinationAfterPreflight = await place();
  const third = await invoke(destinationAfterPreflight, { afterAuthImportDestinationLock: async () => {
    await writeFile(destinationAfterPreflight.destination, "{}", { mode: 0o600 });
  } });
  expectsFailure(third, "destination-changed", "dependency-failed", destinationAfterPreflight.destination);

  const destinationBeforeRename = await place(undefined, "{}");
  const fourth = await invoke(destinationBeforeRename, { beforeAuthImportRename: async () => {
    await realRename(destinationBeforeRename.destination, `${destinationBeforeRename.destination}.old`);
    await writeFile(destinationBeforeRename.destination, "{}", { mode: 0o600 });
  } });
  expectsFailure(fourth, "destination-changed", "dependency-failed", destinationBeforeRename.destination);
});

test("permission, link, size, and temporary identity changes fail at revalidation", async () => {
  const sourceMode = await place();
  expectsFailure(await invoke(sourceMode, { beforeAuthImportRename: () => chmod(sourceMode.source, 0o644) }),
    "source-changed", "dependency-failed", sourceMode.source);

  const sourceLink = await place();
  expectsFailure(await invoke(sourceLink, { beforeAuthImportRename: () => link(sourceLink.source, `${sourceLink.source}.alias`) }),
    "source-changed", "dependency-failed", sourceLink.source);

  const destinationSize = await place(undefined, "{}");
  expectsFailure(await invoke(destinationSize, { beforeAuthImportRename: () => writeFile(destinationSize.destination, "{ } ", { mode: 0o600 }) }),
    "destination-changed", "dependency-failed", destinationSize.destination);

  const temporary = await place();
  const result = await invoke(temporary, { beforeAuthImportRename: async ({ temporary: path }) => {
    await realRename(path, `${path}.old`); await writeFile(path, "{}", { mode: 0o600 });
  } });
  expectsFailure(result, "temporary-changed", "dependency-failed", injected.temporary);

  const sourceGroup = await place();
  expectsFailure(await invoke(sourceGroup, { beforeAuthImportRename: () => { injected.failure = "source-group-changed"; } }),
    "source-changed", "dependency-failed", sourceGroup.source);

  const sourceParent = await place();
  expectsFailure(await invoke(sourceParent, { beforeAuthImportRename: () => { injected.failure = "source-directory-identity-changed"; } }),
    "source-changed", "dependency-failed", sourceParent.source);

  const destinationParent = await place();
  expectsFailure(await invoke(destinationParent, { beforeAuthImportRename: () => { injected.failure = "destination-directory-identity-changed"; } }),
    "destination-changed", "dependency-failed", destinationParent.destination);
});

test("descriptor closes before rename replace empty or refusal outcomes with exact failures", async () => {
  const temporary = await place(); injected.failure = "temporary-close";
  expectsFailure(await invoke(temporary), "import-write-failed");
  await expect(readFile(temporary.destination)).rejects.toMatchObject({ code: "ENOENT" });

  const destination = await place(undefined, "{}"); injected.failure = "destination-close";
  expectsFailure(await invoke(destination), "destination-read-failed", "dependency-failed", destination.destination);
  expect(await readFile(destination.destination, "utf8")).toBe("{}");

  const empty = await place("{}"); injected.failure = "source-close";
  expectsFailure(await invoke(empty), "source-read-failed", "dependency-failed", empty.source);
});

test.each(["source-post-close", "source-directory-post-close", "destination-directory-post-close",
  "destination-directory-sync", "destination-release"])("post-commit %s preserves exact success", async (failure) => {
  const where = await place(); injected.failure = failure;
  const result = await invoke(where);
  expect(result).toEqual({ code: 0, out: success(), err: "" });
  expect(await readFile(where.destination)).toEqual(await readFile(where.source));
});

test("destination lock precedes every content read and source lock follows it", async () => {
  const where = await place(), events: string[] = [];
  const result = await invoke(where, {
    afterAuthImportDestinationLock: () => { events.push("destination-lock"); },
    afterAuthImportSourceLock: () => { events.push("source-lock"); },
    beforeAuthImportRename: () => { events.push("rename"); },
  });
  expect(result).toEqual({ code: 0, out: success(), err: "" });
  expect(events).toEqual(["destination-lock", "source-lock", "rename"]);
});

test("result preflight precedes filesystem access and exact output precedes publication", async () => {
  const where = await place(), events: string[] = []; injected.events = events;
  const result = await invoke(where, {
    afterAuthImportResultPreflight: ({ maximumBytes }) => {
      expect(maximumBytes).toBeLessThanOrEqual(8_192); events.push("preflight");
    },
    afterAuthImportResultPrepared: ({ output }) => {
      expect(output.toString()).toBe(success()); events.push("prepared");
    },
    beforeAuthImportRename: () => { events.push("rename"); },
  });
  expect(result).toEqual({ code: 0, out: success(), err: "" });
  expect(events[0]).toBe("preflight");
  expect(events.indexOf("prepared")).toBeGreaterThan(events.indexOf("filesystem"));
  expect(events.indexOf("prepared")).toBeLessThan(events.indexOf("rename"));
});

test("a real retired-store writer waits on the exact source identity lock", async () => {
  const where = await place(), clock = manualClock();
  let enterSource = (): void => undefined, continueImport = (): void => undefined;
  const entered = new Promise<void>((resolve) => { enterSource = resolve; });
  const importing = invoke(where, { afterAuthImportSourceLock: () => {
    enterSource(); return new Promise<void>((resolve) => { continueImport = resolve; });
  } });
  await entered;
  const writing = fileCredentialStore(where.source, clock).modify("writer", () => Promise.resolve({
    type: "api_key", key: "writer-secret",
  }));
  let settled = false; void writing.finally(() => { settled = true; });
  await new Promise<void>((resolve) => { setImmediate(resolve); });
  expect(settled).toBe(false); expect(clock.pending()).toBe(1);
  continueImport();
  await expect(importing).resolves.toEqual({ code: 0, out: success(), err: "" });
  clock.fire(); await writing;
  expect(JSON.parse(await readFile(where.destination, "utf8"))).toEqual({ one: { type: "api_key", key: SECRET } });
});

function provider(id: string): Provider {
  return { ...fauxProvider({ provider: id }).provider, id, name: id };
}

test("a public Pi login waits on import's destination lock and observes only complete bytes", async () => {
  const where = await place(), runtime = await nativeModelRuntime({ authPath: where.destination, modelsPath: null, refreshOnCreate: false });
  const base = provider("concurrent-login"), configured: Provider = { ...base, auth: { apiKey: {
    name: "Concurrent key", resolve: () => Promise.resolve(undefined),
    login: () => Promise.resolve({ type: "api_key", key: "login-secret" }),
  } } };
  runtime.registerNativeProvider(configured);
  injected.destinationBarrier = true;
  const entered = new Promise<void>((resolve) => { injected.destinationEntered = resolve; });
  const importing = invoke(where);
  if (!CLI_CONTRACTS.some((held) => held.operation === ("auth.import" as never))) {
    expect((await importing).code).toBe(0); return;
  }
  await entered;
  const login = runtime.login(configured.id, "api_key", { notify: () => undefined, prompt: () => Promise.resolve("login-secret") });
  let settled = false; void login.finally(() => { settled = true; });
  await new Promise<void>((resolve) => { setImmediate(resolve); }); expect(settled).toBe(false);
  injected.destinationHeld?.();
  await expect(importing).resolves.toEqual({ code: 0, out: success(), err: "" });
  await expect(login).resolves.toMatchObject({ type: "api_key" });
  expect(JSON.parse(await readFile(where.destination, "utf8"))).toEqual({
    one: { type: "api_key", key: SECRET }, "concurrent-login": { type: "api_key", key: "login-secret" },
  });
});

test("an expired OAuth refresh waits on import's destination lock and sees a complete map", async () => {
  const expired = `{"oauth":{"type":"oauth","refresh":"${SECRET}","access":"old","expires":0}}`;
  const where = await place(undefined, expired);
  const runtime = await nativeModelRuntime({ authPath: where.destination, modelsPath: null, refreshOnCreate: false });
  const base = provider("oauth"), configured: Provider = { ...base, auth: { oauth: {
    name: "OAuth", login: () => Promise.reject(new Error("unused")),
    refresh: () => Promise.resolve({ type: "oauth", refresh: "new", access: "new-access", expires: 4_102_444_800_000 }),
    toAuth: (credential) => Promise.resolve({ apiKey: credential.access }),
  } } };
  runtime.registerNativeProvider(configured);
  injected.destinationBarrier = true;
  const entered = new Promise<void>((resolve) => { injected.destinationEntered = resolve; });
  const importing = invoke(where);
  await entered;
  const refresh = runtime.getAuth(configured.id);
  let settled = false; void refresh.finally(() => { settled = true; });
  await new Promise<void>((resolve) => { setImmediate(resolve); }); expect(settled).toBe(false);
  injected.destinationHeld?.();
  await expect(importing).resolves.toMatchObject({ code: 2, out: "" });
  await expect(refresh).resolves.toBeDefined();
  expect(JSON.parse(await readFile(where.destination, "utf8"))).toEqual({
    oauth: { type: "oauth", refresh: "new", access: "new-access", expires: 4_102_444_800_000 },
  });
});
