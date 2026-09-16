import { readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "vitest";
import { getAgentDir as pinnedPiAgentDirectory } from "@earendil-works/pi-coding-agent";
import { piAgentDirectory } from "../src/model-runtime.ts";

const PI_CONFIG = new URL("../node_modules/@earendil-works/pi-coding-agent/dist/config.js", import.meta.url);
const PI_PACKAGE = new URL("../node_modules/@earendil-works/pi-coding-agent/package.json", import.meta.url);

test("Bot's Pi agent-directory resolver matches the pinned Pi distribution", () => {
  const source = readFileSync(PI_CONFIG, "utf8");
  expect(source).toContain('export const ENV_AGENT_DIR = `${APP_NAME.toUpperCase()}_CODING_AGENT_DIR`;');
  expect(source).toContain("const envDir = process.env[ENV_AGENT_DIR];");
  expect(source).toContain("return expandTildePath(envDir);");
  expect(source).toContain('return join(homedir(), CONFIG_DIR_NAME, "agent");');
  expect(source).toContain('export const CONFIG_DIR_NAME = pkg.piConfig?.configDir || ".pi";');

  const pkg = JSON.parse(readFileSync(PI_PACKAGE, "utf8")) as { piConfig?: { name?: string; configDir?: string } };
  const environmentName = `${(pkg.piConfig?.name ?? "pi").toUpperCase()}_CODING_AGENT_DIR`;
  const custom = join(tmpdir(), "custom-pi");
  const configured = { [environmentName]: custom };
  const tilde = { [environmentName]: "~/custom-pi" };
  expect(piAgentDirectory(configured)).toBe(custom);
  expect(piAgentDirectory(tilde)).toBe(join(homedir(), "custom-pi"));
  expect(piAgentDirectory({})).toBe(join(homedir(), pkg.piConfig?.configDir ?? ".pi", "agent"));
});

test("Bot normalizes a file URL agent directory exactly as pinned Pi does", () => {
  const before = process.env["PI_CODING_AGENT_DIR"];
  const configured = pathToFileURL(join(tmpdir(), "pi file-url agent")).href;
  process.env["PI_CODING_AGENT_DIR"] = configured;
  try {
    expect(piAgentDirectory({ PI_CODING_AGENT_DIR: configured })).toBe(pinnedPiAgentDirectory());
  } finally {
    if (before === undefined) delete process.env["PI_CODING_AGENT_DIR"];
    else process.env["PI_CODING_AGENT_DIR"] = before;
  }
});
