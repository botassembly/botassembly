import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { invokeCli, invokeCliBytes } from "./invoke.ts";

const roots: string[] = [];
const RUN = "2026-09-05T20-00-00-a022";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(bytes: Buffer | string): Promise<{ home: string; record: string }> {
  const root = await mkdtemp(join(tmpdir(), "bot-run-record-"));
  roots.push(root);
  const home = join(root, "home");
  const record = join(home, "runs", RUN, "record.jsonl");
  await mkdir(join(record, ".."), { recursive: true });
  await writeFile(record, bytes);
  return { home, record };
}

test.each([
  ["empty", Buffer.alloc(0)],
  ["invalid UTF-8", Buffer.from([0xff, 0xfe, 0x0a])],
  ["malformed JSONL", Buffer.from('{"record":1}\nnot-json\n')],
  ["a torn final segment", Buffer.from('{"record":1}\ntorn')],
  ["a structurally invalid story", Buffer.from('{"event":"run_end"}\n{"event":"run_start"}\n')],
  ["an unsupported record format", Buffer.from('{"record":999,"event":"run_start"}\n')],
  ["an oversized record", Buffer.alloc(1024 * 1024 + 1, "x")],
])("run record preserves %s exactly through the established reader", async (_name, bytes) => {
  const where = await fixture(bytes);
  const modern = await invokeCliBytes(["run", "record", RUN, "--raw"], { home: where.home });
  expect(modern).toEqual({ code: 0, out: bytes, err: Buffer.alloc(0) });
});

test("run record requires one run, one raw flag, and at most one valued home", async () => {
  const where = await fixture("evidence");
  const malformed = [
    ["run", "record", "--raw"],
    ["run", "record", RUN],
    ["run", "record", RUN, "--raw", "--raw"],
    ["run", "record", RUN, "--raw", "--home"],
    ["run", "record", RUN, "--raw", "--home", where.home, "--home", where.home],
    ["run", "record", RUN, "--raw", "--json"],
    ["run", "record", RUN, "--raw", "-j"],
    ["run", "record", RUN, "--raw", "--child", "child"],
    ["run", "record", RUN, "--raw", "--check", "gate"],
    ["run", "record", RUN, "--raw", "--unknown"],
  ];
  for (const args of malformed) {
    const held = await invokeCliBytes(args, { home: join(where.home, "absent") });
    expect(held.code, args.join(" ")).toBe(2);
    expect(held.out, args.join(" ")).toEqual(Buffer.alloc(0));
    expect(held.err.length, args.join(" ")).toBeGreaterThan(0);
    expect(held.err.length, args.join(" ")).toBeLessThanOrEqual(2_049);
  }
});

test("an explicit home wins over BOT_HOME", async () => {
  const environment = await fixture("wrong");
  const explicit = await fixture("right");
  const held = await invokeCliBytes(["run", "record", RUN, "--raw", "--home", explicit.home], { home: environment.home });
  expect(held).toEqual({ code: 0, out: Buffer.from("right"), err: Buffer.alloc(0) });
});

test("run record preserves established selection failures", async () => {
  const where = await fixture("evidence");
  await rm(where.record);
  const modern = await invokeCliBytes(["run", "record", RUN, "--raw"], { home: where.home });
  expect(modern.code).toBe(1);
  expect(modern.out).toEqual(Buffer.alloc(0));
});

test("capabilities and generated help describe the implemented raw route without legacy rows", async () => {
  const where = await fixture("evidence");
  const capabilities = await invokeCli(["capabilities", "-j"], { home: where.home });
  const document = JSON.parse(capabilities.out) as { data: { commands: Array<Record<string, unknown>> } };
  const operations = document.data.commands.map((held) => held["operation"]);
  expect(operations).toContain("run.record");
  for (const legacy of ["run", "list", "show"]) expect(operations).not.toContain(legacy);
  expect(document.data.commands.find((held) => held["operation"] === "run.record")).toMatchObject({
    operation: "run.record", command: ["run", "record"], output: { kind: "raw" },
    modes: ["raw"], home: "reads", mutates: false, network: "never",
    options: [
      { name: "--home", aliases: [], type: "path", repeatable: false },
      { name: "--raw", aliases: [], type: "boolean", repeatable: false },
    ],
  });
  const help = await invokeCli(["run", "record", "--help"], { home: where.home });
  expect(help.code).toBe(0);
  expect(help.out).toContain("usage: bot run record <run> --raw [--home DIR]");
  expect(help.out).toContain("exactly as stored");
  expect(help.out).not.toContain("--child");
  expect(help.out).not.toContain("--json");
});

test("the new route leaves the retained bytes unchanged", async () => {
  const where = await fixture("evidence");
  await invokeCliBytes(["run", "record", RUN, "--raw"], { home: where.home });
  await expect(readFile(where.record)).resolves.toEqual(Buffer.from("evidence"));
});
