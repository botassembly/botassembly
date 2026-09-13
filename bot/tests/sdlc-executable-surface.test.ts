import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const RETIRED_HANDOFF = /(?:sdlc\/)?planning\/handoff\.md|\bhandoff\.md\b/u;

function filesUnder(relative: string): string[] {
  return readdirSync(join(ROOT, relative), { withFileTypes: true }).flatMap((entry) => {
    const path = join(relative, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function retiredReferences(paths: string[]): string[] {
  return paths.filter((path) => RETIRED_HANDOFF.test(readFileSync(join(ROOT, path), "utf8")));
}

test("executable surfaces do not reference the retired root handoff", () => {
  const retired = ["sdlc", "planning", "handoff.md"].join("/");
  const executable = ["bot/src", "bot/scripts", "docs/scripts", "sdlc/project", "sdlc/scripts"].flatMap(filesUnder);

  expect(existsSync(join(ROOT, retired))).toBe(false);
  expect(retiredReferences(executable)).toEqual([]);
});
