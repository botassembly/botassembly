// Ticket 0295. The collecting boundary is proven directly against a stub
// handler, so the contract test's live comparisons are about the wrappers and
// not about the boundary underneath them.
import { expect, test } from "vitest";
import { commandReading } from "../src/command-reading.ts";

test("the collecting boundary keeps write order across both stdout doors and returns the handler's exit", async () => {
  const reading = await commandReading(async (args, boundary) => {
    boundary.stdout(`ordinary ${args.join(" ")}\n`);
    boundary.stderr("the error write\n");
    const raw = boundary.rawStdout();
    await new Promise<void>((settle) => { raw.end(Buffer.from([0xff, 0x00, 0x7c]), () => { settle(); }); });
    return 4;
  }, ["--json"], "/nowhere", { BOT_FIXTURE: "1" });

  expect(reading.exit).toBe(4);
  expect(reading.stdout.equals(Buffer.concat([Buffer.from("ordinary --json\n"), Buffer.from([0xff, 0x00, 0x7c])]))).toBe(true);
  expect(reading.stderr.toString("utf8")).toBe("the error write\n");
});

test("the collecting boundary hands the handler the supplied working directory and environment", async () => {
  const reading = await commandReading((_args, boundary) => {
    boundary.stdout(`${boundary.cwd} ${String(boundary.env["BOT_FIXTURE"])}\n`);
    return 0;
  }, [], "/nowhere", { BOT_FIXTURE: "1" });

  expect(reading.exit).toBe(0);
  expect(reading.stdout.toString("utf8")).toBe("/nowhere 1\n");
  expect(reading.stderr.length).toBe(0);
});
