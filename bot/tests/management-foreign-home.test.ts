// Ticket 0136 leg 1 — `bot assembly` reaches any home.
//
// Observed before anything changed, through the real CLI: `bot assembly list
// a host-temp --home answered `request-invalid  list` / "This verb takes no
// arguments." `assembly()` (cli.ts) resolved the home with `undefined`, so the
// flag fell through to each verb's own argument check as a stray token — the
// one cause 0129 fixed for the reading verbs, still standing in the lens that
// WRITES. That is why it is worse here: install, link, update and remove all
// change the home they are pointed at, and until now that home could only ever
// be the one BOT_HOME named.
//
// THE CONSTRUCTION THAT LETS THIS FAIL. Two homes in every test, each holding
// a DIFFERENTLY NAMED assembly, and BOT_HOME names the one the flag does not.
// A verb that ignored `--home` would answer for the BOT_HOME home and pass any
// assertion that only said "something was listed", so every assertion below
// names WHICH assembly came back, and the near home is read again afterwards
// wherever the verb writes.
//
// The screen is a claim and the runtime is the truth (cli-help-facts.test.ts's
// method): the flag is READ OFF the ASSEMBLY screen and then typed, so a screen
// that stopped offering it reds on the parse and a runtime that went back to
// refusing it reds on the invocation.
//
// Nothing here touches the real ~/.pi, ~/.cache or ~/.local/share: every home
// is an mkdtemp under the OS temp directory and BOT_HOME is explicit on every
// invocation. No model is reachable from this boundary.
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { invokeCli, printed } from "./invoke.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** A minimal well-formed assembly tree — what makes a link sound rather than BROKEN. */
async function tree(root: string, purpose: string): Promise<string> {
  await mkdir(join(root, "flows", "main"), { recursive: true });
  await writeFile(join(root, "ASSEMBLY.md"), `---\nintelligence: default\n---\n${purpose}\n`);
  await writeFile(join(root, "flows", "main", "FLOW.md"), "---\ndescription: main flow\n---\n");
  await writeFile(join(root, "flows", "main", "01-work.md"), "---\n---\nDo the work.\n");
  return root;
}

interface Homes { root: string; near: string; far: string }

/** Two homes, one assembly each, named apart. `near` is what BOT_HOME says;
 *  `far` is the one only `--home` can reach. */
async function madeHomes(): Promise<Homes> {
  const root = await mkdtemp(join(tmpdir(), "bot-management-home-"));
  roots.push(root);
  const held: Homes = { root, near: join(root, "near"), far: join(root, "far") };
  await tree(join(held.near, "assemblies", "near-bot"), "The near assembly.");
  await tree(join(held.far, "assemblies", "far-bot"), "The far assembly.");
  return held;
}

/** The flag the ASSEMBLY screen offers for the home it manages, off the screen. */
async function offered(home: string): Promise<string> {
  const held = await invokeCli(["assembly", "list", "--help"], { home });
  expect(held.code).toBe(0);
  expect(held.out).toMatch(/^  --home\s+path;/mu);
  return "--home";
}

async function held(home: string): Promise<string[]> {
  return (await readdir(join(home, "assemblies"))).sort();
}

test("assembly list reads the home the flag names, not the one BOT_HOME names, in either direction", async () => {
  const homes = await madeHomes();
  const flag = await offered(homes.near);

  const far = await invokeCli(["assembly", "list", flag, homes.far], { home: homes.near });
  expect(far.code).toBe(0);
  expect(printed(far).map((line) => line.split("  ")[0])).toEqual(["far-bot"]);

  // The other direction, so nothing above could have been passed by a verb that
  // reads whatever home it likes: with no flag, the answer is the near home's.
  const near = await invokeCli(["assembly", "list"], { home: homes.near });
  expect(near.code).toBe(0);
  expect(printed(near).map((line) => line.split("  ")[0])).toEqual(["near-bot"]);
});

test("link and remove round-trip in the home the flag names, and the near home is untouched", async () => {
  const homes = await madeHomes();
  const source = await tree(join(homes.root, "dev-bot"), "The tree being edited.");

  const linked = await invokeCli(["assembly", "link", source, "--home", homes.far], { home: homes.near });
  expect(linked.code).toBe(0);
  // The target IS an assembly, so the BROKEN mark a dangling link earns (0130)
  // is absent here — the whole line is pinned rather than the name alone.
  expect(linked.out).toBe(`dev-bot  linked  -> ${source}\n`);
  expect(await held(homes.far)).toEqual(["dev-bot", "far-bot"]);
  expect(await held(homes.near)).toEqual(["near-bot"]);

  const removed = await invokeCli(["assembly", "remove", "dev-bot", "--home", homes.far], { home: homes.near });
  expect(removed.code).toBe(0);
  expect(removed.out).toBe("dev-bot  removed\n");
  expect(await held(homes.far)).toEqual(["far-bot"]);
  expect(await held(homes.near)).toEqual(["near-bot"]);
  // Removal takes the link and never what it pointed at (management.md).
  expect((await readdir(source)).sort()).toEqual(["ASSEMBLY.md", "flows"]);
});

test("a valueless --home is refused byte for byte, and nothing is installed anywhere", async () => {
  const homes = await madeHomes();
  const source = await tree(join(homes.root, "dev-bot"), "The tree being edited.");

  // The trap 0129 closed for the reading verbs, in the lens that WRITES: a
  // valueless flag shrugged off installs into the home nobody named.
  for (const argv of [["assembly", "install", source, "--home"], ["assembly", "list", "--home"]]) {
    const refused = await invokeCli(argv, { home: homes.near });
    expect([argv.join(" "), refused.code, refused.out, refused.err])
      .toEqual(argv[1] === "list"
        ? [argv.join(" "), 2, "", "Assembly list requires a value after --home.\n"]
        : [argv.join(" "), 2, "", "Assembly creation requires a value after --home.\n"]);
  }
  expect(await held(homes.near)).toEqual(["near-bot"]);
  expect(await held(homes.far)).toEqual(["far-bot"]);
});
