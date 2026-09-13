import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const SPECIFICATION = new URL("../../specification/", import.meta.url).pathname;
const REPOSITORY = new URL("../../", import.meta.url).pathname;
const ELEMENTS = join(SPECIFICATION, "elements");
const DOCUMENTATION = new URL("../../docs/src/content/docs/", import.meta.url).pathname;
const PUBLICATION_VERSION = "0.0.1";

function read(relative: string): string {
  return readFileSync(join(SPECIFICATION, relative), "utf8");
}

function section(text: string, heading: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line === `## ${heading}`);
  if (start < 0) return "";
  const end = lines.findIndex((line, index) => index > start && /^##\s/u.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}

function nestedSection(text: string, heading: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line === `### ${heading}`);
  if (start < 0) return "";
  const end = lines.findIndex((line, index) => index > start && /^#{1,3}\s/u.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}

function captured(text: string, pattern: RegExp, group: string): string {
  const match = pattern.exec(text);
  expect(match).not.toBeNull();
  return match?.groups?.[group] ?? "";
}

function lineStarting(text: string, prefix: string): string {
  return text.split("\n").find((line) => line.startsWith(prefix)) ?? "";
}

function commandSection(text: string, command: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line === `### \`${command}\``);
  if (start < 0) return "";
  const end = lines.findIndex((line, index) => index > start && /^###\s/u.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}

function stability(text: string): string[] {
  return [...text.matchAll(/^> \*\*Stability: (stable|provisional)\.\*\*$/gmu)]
    .map((match) => match[1] ?? "");
}

function statements(text: string): string[] {
  return text.replaceAll("\n", " ").split(/(?<=[.!?])\s+|\s*;\s*|\b(?:but|whereas|while)\b/iu);
}

function unqualifiedImplementationClaims(
  text: string,
  implementationDetail: RegExp,
): string[] {
  return statements(text).filter((claim) => implementationDetail.test(claim)
    && !/\b(?:Bot runtime|this runtime|shipped runtime|runtime implementation|implementation note)\b/iu
      .test(claim.replaceAll(/`[^`]*`/gu, "")));
}

test("portable contracts state observables without Bot implementation choices", () => {
  const runtime = read("elements/runtime.md");
  const busy = read("elements/inspection.md");
  const scratch = section(read("elements/slots.md"), "`$TMP`");

  const tmpClaims = statements(runtime);
  const busyClaims = statements(busy);
  const scratchClaims = statements(scratch);
  expect({
    temporaryCeiling: tmpClaims.some((claim) => /`tmp-max-bytes`[\s\S]*\bceiling\b/iu.test(claim))
      && tmpClaims.some((claim) => /\b(?:above|exceed\w*)\b[\s\S]*\bfault\w*\b/iu.test(claim)),
    liveDirectoryIsBusy: busyClaims.some((claim) => /\b(?:live|fresh)\b[\s\S]*\bholds?\b/iu.test(claim)
      && /\bbusy\b|exits? `0`/iu.test(claim)),
    scratchIsRuntimeOwned: scratchClaims.some((claim) => /\bscratch\b[\s\S]*\bruntime owns?\b/iu.test(claim)),
    scratchIsOutsideWorkingTree: scratchClaims.some((claim) => /\bscratch\b[\s\S]*\b(?:outside|not (?:live|sit)|does not (?:live|sit))\b[\s\S]*\b(?:working tree|`\$PWD`)\b/iu.test(claim)),
    unqualifiedImplementationClaims: [
      ...unqualifiedImplementationClaims(runtime, /\b250\s+milliseconds?\b/iu),
      ...unqualifiedImplementationClaims(busy, /\bten\s+seconds?\b/iu),
      ...unqualifiedImplementationClaims(scratch, /\$XDG_CACHE_HOME\/bot\/tmp|~\/\.cache/iu),
    ],
  }).toEqual({
    temporaryCeiling: true,
    liveDirectoryIsBusy: true,
    scratchIsRuntimeOwned: true,
    scratchIsOutsideWorkingTree: true,
    unqualifiedImplementationClaims: [],
  });
});

test("version 0.0.1 states its publication and compatibility policy", () => {
  const policy = section(read("README.md"), "Version and compatibility");
  expect(policy).toMatch(/\b0\.0\.1\b/u);
  expect(policy).toMatch(/\bpublic alpha\b/iu);
  expect(policy).toMatch(/\btickets?\b/iu);
  expect(policy).toMatch(/\bcompatib/iu);
  expect(policy).toMatch(/\b1\.0\b/u);

  const levels = section(read("conformance.md"), "Conformance levels");
  expect(levels).toMatch(/\b143\b/u);
  expect(levels).toMatch(/\bstatic conformance\b/iu);
  expect(levels).toMatch(/\binvariant (?:compliance|conformance)\b/iu);
  expect(levels).toMatch(new RegExp(`\\b${PUBLICATION_VERSION.replaceAll(".", "\\.")}\\b`, "u"));
});

test("active conformance protects one publication version", () => {
  const conformance = read("conformance.md");
  expect(conformance).toContain(`publication ${PUBLICATION_VERSION}`);
  expect(conformance).not.toMatch(/publication 0\.1(?:\s|$)|(?<![0-9.])0\.1 (?:static|invariant)\b|(?<![0-9.])complete 0\.1 conformance\b/iu);
  expect([...conformance.matchAll(/\b0\.0\.1\b/gu)]).toHaveLength(4);
});

test("every published chapter declares its 0.1 stability level", () => {
  const provisional = new Set(["auth.md", "fanout.md", "inspection.md", "management.md"]);
  const chapters = readdirSync(ELEMENTS, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "invariants-witnesses.md")
    .map((entry) => entry.name);

  for (const chapter of chapters) {
    const prose = read(`elements/${chapter}`);
    expect(stability(prose), chapter).toEqual([
      provisional.has(chapter) ? "provisional" : "stable",
    ]);
    if (provisional.has(chapter)) {
      expect(prose, `${chapter} change boundary`).toMatch(/provisional[\s\S]{0,500}\b(?:may|can)\b[\s\S]{0,80}\bchange\b|subject to change/iu);
    }
  }
  for (const chapter of ["example.md", "conformance.md"]) {
    expect(stability(read(chapter)), chapter).toEqual(["stable"]);
  }

  expect(read("elements/invariants-witnesses.md")).toMatch(/\bnon-normative\b/iu);
  expect(read("CHANGELOG.md")).toMatch(/\bhistory,? not (?:a )?contract\b/iu);
});

test("the access contract describes policy as guidance rather than containment", () => {
  const runtime = read("elements/runtime.md");
  const invariants = read("elements/invariants.md");
  const witnesses = read("elements/invariants-witnesses.md");
  const claims = statements(`${runtime}\n${invariants}`);
  const invariant35 = invariants.split("\n").find((line) => /^35\.\s/u.test(line)) ?? "";
  const witness35 = witnesses.split("\n").find((line) => /^\| 35 \|/u.test(line)) ?? "";

  expect({
    policyIsInstruction: claims.some((claim) => /\baccess polic/iu.test(claim)
      && /\binstruction/iu.test(claim))
      && claims.some((claim) => /\b(?:access )?polic/iu.test(claim)
        && /\b(?:does not|is not)\b[\s\S]*\b(?:security boundary|contain)/iu.test(claim)),
    policyScopeIsDirectDispatch: claims.some((claim) => /\baccess polic/iu.test(claim)
      && /\bmodel-facing\b/iu.test(claim)
      && /\b(?:direct|dispatch)/iu.test(claim)),
    permittedExecutableCanReachOutside: claims.some((claim) => /\b(?:permitted|allowed)\b/iu.test(claim)
      && /\bexecutable\b/iu.test(claim)
      && /\b(?:outside|past|beyond)\b/iu.test(claim)
      && /\bpolic/iu.test(claim)),
    noAbsoluteRestrictionClaim: !/\btools are never restricted\b|\bevery tool the runtime has[\s\S]{0,80}\bin every stage\b/iu
      .test(`${runtime}\n${invariants}`),
    invariant35QualifiesDefaultToolAvailability: /\b(?:without|absent|no)\b[\s\S]*\baccess (?:declaration|policy)\b/iu.test(invariant35)
      && /\b(?:all|every)\b[\s\S]*\btools?\b/iu.test(invariant35),
    removalWitnessRemains: /bot\/tests\/file-tools\.test\.ts/iu.test(witness35)
      && /runtime's file tools include read, write, edit, and a shell/iu.test(witness35),
  }).toEqual({
    policyIsInstruction: true,
    policyScopeIsDirectDispatch: true,
    permittedExecutableCanReachOutside: true,
    noAbsoluteRestrictionClaim: true,
    invariant35QualifiesDefaultToolAvailability: true,
    removalWitnessRemains: true,
  });
});

test("public guidance states the file-observation and operating-system boundary", () => {
  const publications = {
    readme: readFileSync(join(REPOSITORY, "README.md"), "utf8"),
    runtime: read("elements/runtime.md"),
    invariants: read("elements/invariants.md"),
    witnesses: read("elements/invariants-witnesses.md"),
    slots: read("elements/slots.md"),
    inspection: read("elements/inspection.md"),
    inspectionReference: readFileSync(join(DOCUMENTATION, "reference/inspection.md"), "utf8"),
    principles: readFileSync(join(DOCUMENTATION, "principles.md"), "utf8"),
    guide: readFileSync(join(DOCUMENTATION, "guides/install-and-use.md"), "utf8"),
  };

  for (const [name, prose] of Object.entries(publications)) {
    expect(prose, `${name} says Bot is not a sandbox`).toMatch(/Bot is not (?:an operating-system )?sandbox|Bot does not provide operating-system containment|not a sandbox/iu);
  }
  for (const [name, prose] of Object.entries({
    readme: publications.readme,
    runtime: publications.runtime,
    invariants: publications.invariants,
    slots: publications.slots,
    principles: publications.principles,
  })) {
    expect(prose, `${name} distinguishes call reports from file observation`).toMatch(/reported direct tool calls|direct tool calls reported|calls reported by the model harness/iu);
    expect(prose, `${name} denies complete file observation`).toMatch(/does not watch the filesystem[^.]*complete list of changes|does not watch the filesystem[^.]*list every side effect/iu);
  }
  expect(publications.runtime).toMatch(/declared access policy[\s\S]{0,300}model-facing dispatch of direct tool calls[\s\S]{0,300}does not provide a security boundary or operating-system containment/iu);
  expect(publications.runtime).toMatch(/reported direct tool calls[^.]*retained model sessions/iu);
  expect(publications.runtime).toMatch(/does not watch the filesystem[^.]*complete list of changes/iu);
  expect(publications.invariants).toMatch(/^34\. Bot does not provide operating-system containment\./mu);
  expect(publications.invariants).toMatch(/^37\. Bot retains reported direct tool calls and denied direct calls\. It does not watch the filesystem or claim a complete list of changes\./mu);
  expect(publications.witnesses).toMatch(/\| 37 \|[^\n]*reported direct tool calls[^\n]*does not watch the filesystem/iu);
  for (const prose of [publications.inspection, publications.inspectionReference]) {
    expect(prose).toMatch(/`bot run events` reports retained direct tool calls[\s\S]{0,100}does not watch the filesystem/iu);
  }
  expect(publications.guide).toMatch(/absolute paths outside[^.]*working directory[^.]*operating system permits/iu);
});

test("the stage contract publishes the complete closed access grammar", () => {
  const access = section(read("elements/stage.md"), "Access");

  expect(access).toMatch(/`access` is a mapping/iu);
  for (const operation of ["read", "write", "edit", "bash"]) expect(access).toContain(`\`${operation}\``);
  expect(access).toMatch(/each operation[^.]+array[^.]+no duplicate/iu);
  expect(access).toMatch(/`access: \{\}`[^.]+den(?:y|ies)/iu);
  expect(access).toMatch(/empty operation arrays[^.]+den(?:y|ies)/iu);
  for (const slot of ["INPUT", "OUTPUT", "TMP", "SKILLS", "PWD"]) expect(access).toContain(`\`${slot}\``);
  expect(access).toMatch(/declared assembly slot[^.]+uppercase export/iu);
  expect(access).toMatch(/`SUBFLOWS`[^.]+subflows are in scope/iu);
  expect(access).toMatch(/Bash names start with an ASCII letter or digit/iu);
  expect(access).toMatch(/remaining characters may be ASCII letters, digits, `\.`, `_`, `\+`, or `-`/iu);
  expect(access).toMatch(/does not prove[^.]+installed/iu);
  expect(access).toMatch(/belongs only to `STAGE`/iu);
  expect(access).toMatch(/control sentinel[^.]+refused/iu);
});

test("published model readings distinguish pinned and live network behavior", () => {
  const published = [
    commandSection(read("elements/inspection.md"), "bot model list"),
    readFileSync(join(DOCUMENTATION, "reference/models.md"), "utf8"),
  ];
  for (const text of published) {
    expect(text).toMatch(/without `--live`[\s\S]*(?:locally configured|local) catalog[\s\S]*does not contact/iu);
    expect(text).toMatch(/`--live`[\s\S]*current catalogs[\s\S]*may contact/iu);
    expect(text).toMatch(/`PI_OFFLINE`[\s\S]*veto/iu);
    expect(text).toMatch(/failed or aborted live refresh[\s\S]*exit(?:s)? `?4`?[\s\S]*no model rows/iu);
    expect(text).toMatch(/named provider[\s\S]*without a credential[\s\S]*before contacting/iu);
    expect(text).not.toMatch(/nothing here reaches the network/iu);
  }
});

test("the model reference publishes the trusted local configuration limit", () => {
  const text = readFileSync(join(DOCUMENTATION, "reference/models.md"), "utf8");
  expect(text).toMatch(/models\.json[\s\S]*trusted operator input[\s\S]*command[\s\S]*process owner's filesystem and network authority/iu);
  expect(text).toMatch(/arbitrary environment names[\s\S]*cannot be scrubbed/iu);
});

test("the record contract bounds process-crash and run-tree durability", () => {
  const claims = statements(section(read("elements/record.md"), "How it is written"));
  expect({
    processCrashReadable: claims.some((claim) => /\bprocess (?:crash|death)\b/iu.test(claim)
      && /\b(?:readable|survive)\b/iu.test(claim)),
    terminalMayPrecedeSync: claims.some((claim) => /(?:\bterminal\b|`run_end`)/iu.test(claim)
      && /\b(?:visible|observable|observed)\b/iu.test(claim)
      && /\bbefore\b[\s\S]*\bsync/iu.test(claim)),
    recordSyncDoesNotCoverTree: claims.some((claim) => /\bsync/iu.test(claim)
      && /\brecord(?: file)?\b/iu.test(claim)
      && /\b(?:does not|cannot|not)\b[\s\S]*\b(?:directory|run tree|other files)\b/iu.test(claim)),
    observedEndMayPrecedeIncompleteTree: claims.some((claim) => /(?:\bterminal\b|`run_end`)/iu.test(claim)
      && /\b(?:visible|observable|observed)\b/iu.test(claim)
      && /\bpower[ -]loss\b/iu.test(claim)
      && /\b(?:incomplete|missing|lost)\b[\s\S]*\b(?:run tree|other files|tree)\b/iu.test(claim)),
    noSealedPowerLossGuarantee: !claims.some((claim) => /\bsealed records?\b/iu.test(claim)
      && /\bpower[ -]loss\b/iu.test(claim)
      && /\b(?:survive|durable)\b/iu.test(claim)),
  }).toEqual({
    processCrashReadable: true,
    terminalMayPrecedeSync: true,
    recordSyncDoesNotCoverTree: true,
    observedEndMayPrecedeIncompleteTree: true,
    noSealedPowerLossGuarantee: true,
  });
  expect(read("CHANGELOG.md")).toMatch(/\bTicket 0184\b[\s\S]{0,300}\b(?:access|durab|sync)\w*/iu);
});

test("invariant witness 46 names the current event-shape proofs without a constructor count", () => {
  const row = read("elements/invariants-witnesses.md")
    .split("\n")
    .find((line) => line.startsWith("| 46 |")) ?? "";
  const proofs = [
    "the constructor registry and field coverage ledger cover every current event field",
    "every known top-level field rejects a wrong type and unknown top-level fields stay additive",
    "each required field is required in its constructor form",
    "closed nested shapes and conditional groups reject partial or extra members",
    "the reader schema accepts every current constructor and its conditional forms",
    "the reader schema rejects missing required fields and broken conditional groups",
  ];

  expect(row).toContain("`bot/tests/record-event-shape.test.ts`");
  for (const proof of proofs) expect(row).toContain(`\"${proof}\"`);
  expect(row).not.toContain("all fourteen event constructors preserve the closed vocabulary and presence rules");
  expect(row).not.toMatch(/\b\d+\s+(?:current\s+)?event constructors?\b/iu);
  expect(row).toContain("`bot/tests/hostile-flow.test.ts` \"one unreadable input-file is that call's outcome\"");
  expect(row).toMatch(/`bot\/tests\/cli-fanout-handoff\.test\.ts`[^;]+`repeat` present inside a LOOP and absent outside[^;]+placement/iu);
  expect(row).toContain("`bot/tests/cli-json-and-show.test.ts` \"leg 6 — rendered `bot run events` is one line per recorded event\"");
  expect(row).toContain("Honest limit: \"never because a runtime chose to leave it out\"");
});

test("invariant witness 7 names the complete control-tool vocabulary and its exhaustive proof", () => {
  const invariants = read("elements/invariants.md");
  const invariant = captured(invariants, /^(?<invariant>10\. Affect control flow[\s\S]+?)(?=^11\.)/mu, "invariant");
  const named = captured(invariant, /tools — (?<names>[\s\S]+?)\s+\(\[control tools\]/u, "names")
    .replaceAll("\n", " ").split(",").map((name) => name.trim());
  const runtime = section(read("elements/runtime.md"), "Control tools");
  const runtimeNames = [...runtime.matchAll(/^\| (?<name>[a-z][a-z-]*)\s+\|/gmu)].map((match) => match.groups?.["name"] ?? "");
  const row = lineStarting(read("elements/invariants-witnesses.md"), "| 7 |");
  const expected = ["mark", "refuse", "fault", "continue", "select", "subflow", "clean-temp"];
  const ordinaryClaim = captured(row, /ordinary tool list is exactly (?<names>[^.]+)\. The conditional/u, "names");
  const ordinaryNames = [...ordinaryClaim.matchAll(/`(?<name>[a-z][a-z-]*)`/gu)].map((match) => match.groups?.["name"] ?? "");
  const conditionalName = captured(row, /The conditional `(?<name>[a-z][a-z-]*)` tool joins only when the author placed one in scope/u, "name");

  expect(named).toEqual(expected);
  expect(runtimeNames).toEqual(expected);
  expect(ordinaryNames).toEqual(["mark", "refuse", "continue", "select", "clean-temp", "fault"]);
  expect(conditionalName).toBe("subflow");
  expect(row).not.toMatch(/\b(?:five|six|seven|fifth|sixth|seventh|eighth|\d+)\s+(?:ordinary )?(?:tools?|affordances?)\b|\bthe (?:fifth|sixth|seventh|eighth)\b/iu);
  expect(row).toContain("\"ordinary control tool names are exhaustive and sequential, and invalid decisions reject without selecting\"");
});

test("the hooks contract sends an agent-reported fault and its retained reason to failure", () => {
  const hooks = read("elements/hooks.md");
  const environment = section(hooks, "How a hook is run");
  const triggers = section(hooks, "When they run");

  expect(triggers).toMatch(/`failure` runs[^.]+(?:agent-reported )?`?fault`?/iu);
  expect(triggers).toMatch(/does not run when a signal ended the stage/iu);
  expect(environment).toMatch(/`\$REASON`[^.]+retained captured text/iu);
  expect(environment).toMatch(/capture contains[^.]+agent-reported fault's reason/iu);
});

test("both source run id file statements name the current run-creation commands", () => {
  const reference = readFileSync(join(DOCUMENTATION, "reference/invocation.md"), "utf8");
  const statements = new Map([
    ["runtime", nestedSection(read("elements/runtime.md"), "Run id file")],
    ["invocation", section(read("elements/invocation.md"), "Run id file")],
  ]);
  for (const [name, statement] of statements) {
    for (const command of ["bot run start", "bot run resume"]) {
      expect(statement, `${name}: ${command}`).toContain(`\`${command}\``);
    }
  }
  expect(reference).toContain("[Run id file](/specification/running/#run-id-file)");
});

test("the provisional inspection chapter names its current retrievals", () => {
  const inspection = read("elements/inspection.md");
  const provisionalNote = stability(inspection);
  expect(provisionalNote).toEqual(["provisional"]);

  for (const command of ["bot run events", "bot run session", "bot run check", "bot run checklist", "bot run output", "bot run request", "bot run list", "bot model list"]) {
    expect(commandSection(inspection, command), command).not.toBe("");
  }
});
