// Ticket 0011 — deterministic fuzz of the assembly reader. A seeded PRNG
// (seed committed below; no Math.random at test time) builds hostile assembly
// trees by mutating a sound base across the ticket's dimensions: broken
// frontmatter, YAML anchors and wrong types, empty and huge files, encodings,
// hostile names, deep nesting, symlinks, collisions, permissions, and
// files-for-directories swaps. The invariant for EVERY tree: the reader
// accepts (exit 0) or refuses (exit 2 with fault sentences) — never a throw,
// never a hang — and answers identically when asked twice. FUZZ_CASES bounds
// the sweep; `make check` runs the committed default, `make fuzz` a wider one.
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { check } from "../src/reader.ts";

const SEED = 0x0011_b07a;
const CASES = Number(process.env["FUZZ_CASES"] ?? "120");
const isRoot = process.getuid?.() === 0;

/** mulberry32: a tiny deterministic PRNG; the committed SEED fixes every case. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

type Rand = () => number;
const int = (rand: Rand, bound: number): number => Math.floor(rand() * bound);
const pick = <T>(rand: Rand, items: readonly T[]): T => {
  const held = items[int(rand, items.length)];
  if (held === undefined) throw new TypeError("pick from empty list");
  return held;
};

const DOCUMENTS = [
  "asm/ASSEMBLY.md",
  "asm/flows/main/FLOW.md",
  "asm/flows/main/01-a.md",
  "asm/flows/main/02-b/STAGE.md",
  "asm/flows/other/FLOW.md",
  "asm/flows/other/01-c.md",
  "asm/subflows/helper/FLOW.md",
  "asm/subflows/helper/01-d.md",
  "asm/skills/s1/SKILL.md",
] as const;

const INVOCATIONS = [
  "./asm --home ./home",
  "./asm/main --home ./home",
  "./asm/other --home ./home a request",
  "./asm/main --home ./home @task.md",
  "./asm/helper --home ./home",
] as const;

/** A sound base assembly the mutations then attack. */
function buildBase(root: string): void {
  for (const document of DOCUMENTS) mkdirSync(join(root, document, ".."), { recursive: true });
  writeFileSync(join(root, "asm", "ASSEMBLY.md"), "---\nintelligence: default\n---\nRoute the request.\n");
  writeFileSync(join(root, "asm", "flows", "main", "FLOW.md"), "---\ndescription: main\n---\n");
  writeFileSync(join(root, "asm", "flows", "main", "01-a.md"), "---\n---\nDo the first thing.\n");
  writeFileSync(join(root, "asm", "flows", "main", "02-b", "STAGE.md"), "---\n---\nDo the second thing.\n");
  writeFileSync(join(root, "asm", "flows", "main", "02-b", "gate.sh"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  writeFileSync(join(root, "asm", "flows", "other", "FLOW.md"), "---\ndescription: other\n---\n");
  writeFileSync(join(root, "asm", "flows", "other", "01-c.md"), "---\n---\nDo the other thing.\n");
  writeFileSync(join(root, "asm", "subflows", "helper", "FLOW.md"), "---\ndescription: helper\n---\n");
  writeFileSync(join(root, "asm", "subflows", "helper", "01-d.md"), "---\n---\nHelp.\n");
  writeFileSync(join(root, "asm", "skills", "s1", "SKILL.md"), "---\ndescription: a skill\n---\nUse it.\n");
  mkdirSync(join(root, "home"));
  writeFileSync(join(root, "home", "config.yaml"), "timeout: 60\n");
  writeFileSync(join(root, "task.md"), "---\n---\nThe task.\n");
}

const FRONTMATTERS = [
  "no fence at all\n",
  "---\nnever: closed\n",
  "---\nkey: 1\nkey: 2\n---\nbody\n",
  "---\ntimeout: []\nretries: -3\nreasoning: sideways\nslots: [1, 2]\n---\nbody\n",
  "---\nmodel: !!binary aGk=\nprovider: !odd p\n---\nbody\n",
  `---\na: &a [x, x, x, x, x, x, x, x, x, x]\nb: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]\nc: [*b, *b, *b, *b, *b, *b, *b, *b, *b, *b, *b]\n---\nbody\n`,
  `---\nmodel: "${"m".repeat(131_072)}"\n---\nbody\n`,
  "---\n---\n---\nsecond: fence\n---\nbody\n",
  "---\nslots:\n  __proto__: polluted\n---\nbody\n",
] as const;

const HOSTILE_NAMES = ["-rf.md", "a b c.md", "..almost", `${"n".repeat(180)}.md`, "р-cyrillic.md", "'quoted'.md"] as const;

type Mutation = (rand: Rand, root: string) => void;

const rewriteDocument: Mutation = (rand, root) => {
  writeFileSync(join(root, pick(rand, DOCUMENTS)), pick(rand, FRONTMATTERS));
};

const truncateDocument: Mutation = (rand, root) => {
  writeFileSync(join(root, pick(rand, DOCUMENTS)), "");
};

const hugeBody: Mutation = (rand, root) => {
  writeFileSync(join(root, pick(rand, DOCUMENTS)), `---\n---\n${"words ".repeat(87_381)}\n`);
};

const mangleBytes: Mutation = (rand, root) => {
  const prefixes = [
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from([0xff, 0xfe]),
    Buffer.from([0x00]),
    Buffer.from([0xc3, 0x28, 0x80]),
  ] as const;
  const body = Buffer.from("---\r\nprovider: p\r\n---\r\nCarriage returns.\r\n");
  writeFileSync(join(root, pick(rand, DOCUMENTS)), Buffer.concat([pick(rand, prefixes), body]));
};

const hostileName: Mutation = (rand, root) => {
  const parent = pick(rand, ["asm", "asm/flows", "asm/flows/main", "asm/flows/main/02-b"] as const);
  writeFileSync(join(root, parent, pick(rand, HOSTILE_NAMES)), "---\n---\nStray.\n");
};

const deepNesting: Mutation = (rand, root) => {
  let dir = join(root, "asm", "flows", "main", "01-deep");
  for (let level = 0; level < 20 + int(rand, 10); level += 1) dir = join(dir, `level-${String(level)}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "junk.md"), "---\n---\nDeep.\n");
};

const plantSymlink: Mutation = (rand, root) => {
  const place = join(root, "asm", pick(rand, ["flows/main/03-link.md", "flows/link", "skills/s1/link", "link"] as const));
  const kind = int(rand, 3);
  if (kind === 0) symlinkSync(place, place);
  else if (kind === 1) symlinkSync("/etc/passwd", place);
  else symlinkSync(join(root, "asm", "ASSEMBLY.md"), place);
};

const collideNames: Mutation = (_rand, root) => {
  mkdirSync(join(root, "asm", "subflows", "main"), { recursive: true });
  writeFileSync(join(root, "asm", "subflows", "main", "FLOW.md"), "---\ndescription: twin\n---\n");
  writeFileSync(join(root, "asm", "subflows", "main", "01-e.md"), "---\n---\nTwin.\n");
};

const dropPermissions: Mutation = (rand, root) => {
  if (isRoot) return;
  const target = pick(rand, [
    "asm/ASSEMBLY.md", "asm/flows", "asm/flows/main", "asm/flows/main/02-b",
    "asm/flows/main/02-b/gate.sh", "asm/skills", "home/config.yaml",
  ] as const);
  chmodSync(join(root, target), 0o000);
};

const swapFileAndDirectory: Mutation = (rand, root) => {
  const target = pick(rand, [...DOCUMENTS, "asm/flows", "asm/skills", "asm/subflows", "asm/flows/main", "home"] as const);
  rmSync(join(root, target), { recursive: true, force: true });
  if (target.endsWith(".md") || target.endsWith(".yaml")) mkdirSync(join(root, target), { recursive: true });
  else writeFileSync(join(root, target), "a file where a folder belongs\n");
};

const duplicateNumbers: Mutation = (rand, root) => {
  const flow = join(root, "asm", "flows", "main");
  writeFileSync(join(flow, "01-dupe.md"), "---\n---\nSame number.\n");
  writeFileSync(join(flow, `${"9".repeat(17 + int(rand, 4))}-big.md`), "---\n---\nHuge number.\n");
  writeFileSync(join(flow, "unnumbered.md"), "---\n---\nNo number.\n");
};

const MUTATIONS: readonly (readonly [string, Mutation])[] = [
  ["rewriteDocument", rewriteDocument],
  ["truncateDocument", truncateDocument],
  ["hugeBody", hugeBody],
  ["mangleBytes", mangleBytes],
  ["hostileName", hostileName],
  ["deepNesting", deepNesting],
  ["plantSymlink", plantSymlink],
  ["collideNames", collideNames],
  ["dropPermissions", dropPermissions],
  ["swapFileAndDirectory", swapFileAndDirectory],
  ["duplicateNumbers", duplicateNumbers],
];

const HOSTILE_INVOCATIONS = [
  "",
  "--",
  "./asm//main --home ./home",
  "././asm --home ./home",
  "./asm/main --home ./home --timeout",
  "./asm/main --home ./home --timeout googol",
  "./asm/main --home ./home --reasoning wrong extra words here",
  "./asm/main --home ./home @missing.md",
  "./asm/main --home ./home @task.md @task.md",
  `./${"a/".repeat(120)}deep --home ./home`,
  "./asm/main --home ./home 'quoted request' trailing",
  "./asm/../asm/main --home ./home",
] as const;

const base = mkdtempSync(join(tmpdir(), "bot-fuzz-"));

afterAll(() => {
  execFileSync("chmod", ["-R", "u+rwX", base]);
  execFileSync("rm", ["-rf", base]);
});

for (let index = 0; index < CASES; index += 1) {
  test(`fuzz seed ${String(SEED)} case ${String(index)}`, () => {
    const rand = mulberry32(SEED ^ Math.imul(index + 1, 0x9e37_79b9));
    const root = join(base, `case-${String(index)}`);
    mkdirSync(root);
    buildBase(root);
    const applied = 1 + int(rand, 3);
    for (let step = 0; step < applied; step += 1) {
      try {
        pick(rand, MUTATIONS)[1](rand, root);
      } catch {
        // An earlier mutation removed the ground this one stood on; the tree
        // as mutated so far is still a deterministic case.
      }
    }
    const invocation = rand() < 0.15 ? pick(rand, HOSTILE_INVOCATIONS) : pick(rand, INVOCATIONS);
    const result = check(invocation, root, process.env);
    expect([0, 2]).toContain(result.exitCode);
    for (const line of result.lines) {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (result.exitCode === 2) {
        expect(typeof parsed["code"]).toBe("string");
        expect(typeof parsed["path"]).toBe("string");
        expect(typeof parsed["message"]).toBe("string");
      }
    }
    if (result.exitCode === 2) expect(result.lines.length).toBeGreaterThan(0);
    expect(check(invocation, root, process.env)).toEqual(result);
  }, 15_000);
}
