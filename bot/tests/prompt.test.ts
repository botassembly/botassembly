import { readFile, readdir } from "node:fs/promises";
import { expect, test } from "vitest";
import {
  buildInitialPrompt,
  buildSystemPrompt,
  checklistFeedback,
  missingOutputFeedback,
  questionPrompt,
  sendBackPrompt,
  type PromptSystem,
} from "../src/prompt.ts";

async function byteMatches(name: string, actual: string): Promise<void> {
  const expected = await readFile(new URL(`golden/${name}`, import.meta.url));
  expect(Buffer.compare(Buffer.from(actual), expected), name).toBe(0);
}

function firstSetup(): PromptSystem {
  return {
    purpose: "Produce careful answers grounded in the supplied material.",
    instruction: "Summarize the request clearly and accurately.",
    output: { format: "text" },
    slots: [{ name: "kb", description: "Trusted reference collection." }],
    skills: [],
    helpers: [],
  };
}

test("first and send-back rounds keep byte-identical prefix messages", async () => {
  const first = {
    system: buildSystemPrompt(firstSetup()),
    user: buildInitialPrompt(["request.md", "notes.txt"], true),
  };
  const sendBack = {
    system: buildSystemPrompt(firstSetup()),
    user: buildInitialPrompt(["request.md", "notes.txt"], true),
    feedback: sendBackPrompt(Buffer.from(missingOutputFeedback())),
  };
  await byteMatches("first-round.system.txt", first.system);
  await byteMatches("first-round.user.txt", first.user);
  await byteMatches("first-round.system.txt", sendBack.system);
  await byteMatches("first-round.user.txt", sendBack.user);
  await byteMatches("send-back-round.feedback.txt", sendBack.feedback);
  expect(Buffer.compare(Buffer.from(first.system), Buffer.from(sendBack.system))).toBe(0);
  expect(Buffer.compare(Buffer.from(first.user), Buffer.from(sendBack.user))).toBe(0);
});

test("checklist instructions, contract, and unfinished text match goldens", async () => {
  const setup: PromptSystem = {
    purpose: "Produce concise, verifiable answers.",
    instruction: [
      "Check the facts and write a brief response.",
      "## Checklist",
      "- Verify every claim against the supplied material",
      "- Keep the response under 200 words",
    ].join("\n\n"),
    output: {
      format: "markdown",
      schema: "---\nsummary: str\nreviewed: bool\n---\n\n## Answer",
    },
    slots: [],
    skills: [],
    helpers: [],
  };
  await byteMatches("checklist-stage.system.txt", buildSystemPrompt(setup));
  await byteMatches("checklist-stage.user.txt", buildInitialPrompt(["request.txt"], true));
  await byteMatches("checklist-stage.feedback.txt", checklistFeedback([
    { number: 1, text: "Verify every claim against the supplied material" },
    { number: 2, text: "Keep the response under 200 words" },
  ]));
});

test("a JSON schema is rendered as an instance contract without document metadata", () => {
  const schema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://example.test/schemas/artifact",
    title: "Artifact output",
    $comment: "This describes the schema document, not an output.",
    type: "object",
    additionalProperties: false,
    required: ["artifact"],
    properties: {
      artifact: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: "artifact",
        title: "Artifact text",
        $comment: "A human-readable field annotation.",
        type: "string",
        minLength: 1,
      },
      title: { type: "string" },
    },
    definitions: {
      legacy: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: "legacy",
        title: "Legacy definition",
        $comment: "A legacy definition annotation.",
        type: "integer",
        minimum: 0,
      },
    },
  };
  const prompt = buildSystemPrompt({
    purpose: "Produce a valid artifact.",
    instruction: "Write the artifact.",
    output: { format: "json", schema: JSON.stringify(schema, null, 2) },
    slots: [],
    skills: [],
    helpers: [],
  });
  const schemaStart = prompt.indexOf("{", prompt.indexOf("# Output"));
  const schemaEnd = prompt.indexOf("\n\n# Slots", schemaStart);
  expect(JSON.parse(prompt.slice(schemaStart, schemaEnd))).toEqual({
    type: "object",
    additionalProperties: false,
    required: ["artifact"],
    properties: {
      artifact: { type: "string", minLength: 1 },
      title: { type: "string" },
    },
    definitions: {
      legacy: { type: "integer", minimum: 0 },
    },
  });
  expect(prompt).toMatch(/write an instance of this schema/iu);
  expect(prompt).toMatch(/do not copy schema keywords into the output/iu);
});

test("a choice has input but no output announcement", async () => {
  const setup: PromptSystem = {
    purpose: "Protect the quality of published work.",
    instruction: [
      "Choose the safest response.",
      "- `patch` — correct a small, isolated problem",
      "- `revert` — restore the last known good version",
    ].join("\n\n"),
    slots: [],
    skills: [],
    helpers: [],
  };
  await byteMatches("choose.system.txt", buildSystemPrompt(setup));
  await byteMatches("choose.user.txt", buildInitialPrompt(["request.json"], false));
});

test("the later question is appended verbatim", async () => {
  await byteMatches("loop-question.txt", questionPrompt("Is the draft accurate and complete?\n"));
});

test("skills and callable helpers are flattened and bytewise ordered", async () => {
  const setup: PromptSystem = {
    purpose: "Turn source material into a dependable brief.",
    instruction: "Write a sourced brief for a careful reader.",
    output: { format: "text" },
    slots: [],
    skills: [
      { name: "house-style", description: "Apply the publication's editorial conventions." },
      { name: "fact-check", description: "Verify factual claims against primary sources." },
    ],
    helpers: [
      { name: "summarize", description: "Condense long material without losing qualifications." },
      { name: "research", description: "Find relevant primary evidence." },
    ],
  };
  await byteMatches("skills-present.system.txt", buildSystemPrompt(setup));
});

test("no golden discloses hidden runtime facts", async () => {
  const names = await readdir(new URL("golden", import.meta.url));
  const forbidden = [
    /\/(?:home|Users)\//iu,
    /\/private\/fixtures\/review-kit/iu,
    /\bgates?\b/iu,
    /\b(?:provider|model|openai|anthropic|claude|gpt|gemini)\b/iu,
    /\b(?:retry|retries|attempts?|rounds?)\b/iu,
    /\b(?:assembly|assemblies|flow|flows|stage|stages)\b/iu,
    /\bBOT_HOME\b/iu,
    /\.local\/share\/bot\b/iu,
  ];
  for (const name of names) {
    const text = await readFile(new URL(`golden/${name}`, import.meta.url), "utf8");
    for (const pattern of forbidden) expect(text, `${name} contains ${String(pattern)}`).not.toMatch(pattern);
  }
});
