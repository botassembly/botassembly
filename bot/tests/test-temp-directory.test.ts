// The suite must override an inherited host temp directory before any test
// builds a sandbox. A checkout-owned root makes an accidental host-temp
// dependency fail in every run while keeping all test artifacts together.
import { ESLint } from "eslint";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test } from "vitest";
import { credentialPath, resolveHome } from "../src/invocation.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("the suite gives every test an isolated checkout-owned temp root", async () => {
  const checkout = await realpath(process.cwd());
  const temporary = await realpath(tmpdir());
  const location = relative(checkout, temporary);
  expect(location).not.toBe("");
  expect(location.startsWith("..")).toBe(false);
  expect([process.env["TMPDIR"], process.env["TMP"], process.env["TEMP"]])
    .toEqual([tmpdir(), tmpdir(), tmpdir()]);

  const root = await mkdtemp(join(tmpdir(), "bot-test-temp-"));
  roots.push(root);
  expect(await realpath(dirname(root))).toBe(temporary);
});

test("the suite keeps default home, Bot configuration, and Pi paths beneath its temporary root", () => {
  const temporary = tmpdir();
  for (const path of [
    process.env["HOME"],
    process.env["XDG_CONFIG_HOME"],
    resolveHome(process.cwd(), undefined, process.env),
    credentialPath(process.env),
    getAgentDir(),
  ]) {
    expect(path).toBeDefined();
    expect(relative(temporary, path ?? "").startsWith("..")).toBe(false);
  }
  expect(getAgentDir()).toBe(process.env["PI_CODING_AGENT_DIR"]);
});

test("lint rejects a test that names the host temp directory", async () => {
  const lint = new ESLint({ cwd: process.cwd() });
  for (const source of [
    `export const temp = ${JSON.stringify(["/", "tmp", "/bot-test"].join(""))};`,
    ["export const temp = `", "/", "tmp", "/bot-test`;"].join(""),
  ]) {
    const [result] = await lint.lintText(source, { filePath: "tests/probe.test.ts" });
    expect(result?.messages.some((message) =>
      message.ruleId === "no-restricted-syntax" && /host temporary-directory paths/u.test(message.message)))
      .toBe(true);
  }
});
