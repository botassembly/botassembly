// Ticket 0282, contradiction C9: checklist.md says "A mark without nonempty
// evidence is likewise an error and leaves the item `todo`", and runtime.md
// says a missing or empty one rejects the mark. `mark` validated the skip
// reason by trimming and never inspected the evidence, so whitespace passed
// the provider-side minimum length and was retained as if it were evidence.
import { expect, test } from "vitest";
import { createControlContext, createControlTools, type ControlContext } from "../src/tools.ts";

function mark(context: ControlContext, params: Record<string, unknown>): Promise<unknown> {
  const tool = createControlTools().find((held) => held.name === "mark");
  if (tool === undefined) throw new Error("the control tools lost mark");
  return tool.execute("call-1", params, new AbortController().signal, () => undefined, context);
}

test("whitespace-only evidence rejects the mark and leaves the item todo", async () => {
  const context = createControlContext(["Check the output."]);
  await expect(mark(context, { item: 1, state: "done", evidence: "   \t\n" }))
    .rejects.toThrow("A checklist mark requires evidence.");
  expect(context.checklist).toEqual([{ text: "Check the output.", state: "todo" }]);
});

test("whitespace-only evidence rejects a skip that carries a reason", async () => {
  const context = createControlContext(["Check the output."]);
  await expect(mark(context, { item: 1, state: "skipped", evidence: " ", reason: "Not applicable." }))
    .rejects.toThrow("A checklist mark requires evidence.");
  expect(context.checklist).toEqual([{ text: "Check the output.", state: "todo" }]);
});

test("evidence with content still marks the item", async () => {
  const context = createControlContext(["Check the output."]);
  await expect(mark(context, { item: 1, state: "done", evidence: "Read $OUTPUT and compared it to the schema." }))
    .resolves.toMatchObject({ details: { item: 1, state: "done" } });
  expect(context.checklist).toEqual([{ text: "Check the output.", state: "done" }]);
});
