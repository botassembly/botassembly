import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { CREDENTIAL_ENVIRONMENT_NAMES, SECRET_CREDENTIAL_ENVIRONMENT_NAMES } from "../src/credential-environment.ts";
import { detectKnownSecrets, formatSecretMatch, type SecretMatch } from "../src/secret-detection.ts";

const hash = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const only = (value: string | Buffer): SecretMatch => {
  const result = detectKnownSecrets(Buffer.isBuffer(value) ? value : Buffer.from(value));
  expect(result.kind).toBe("matches");
  if (result.kind !== "matches") throw new Error("expected matches");
  expect(result.matches).toHaveLength(1);
  const match = result.matches[0];
  if (match === undefined) throw new Error("expected one match");
  return match;
};

const prefixRules = [
  ["openai-project", "sk-" + "proj-", 40, 256, "A"],
  ["openai-service", "sk-" + "svcacct-", 40, 256, "A"],
  ["anthropic-key", "sk-" + "ant-", 40, 256, "A"],
  ["google-api-key", "AI" + "za", 39, 39, "A"],
  ["github-fine-grained", "github_" + "pat_", 30, 255, "A"],
  ["github-classic", "gh" + "p_", 40, 40, "A"],
  ["github-classic", "gh" + "o_", 40, 40, "A"],
  ["github-classic", "gh" + "u_", 40, 40, "A"],
  ["github-classic", "gh" + "s_", 40, 40, "A"],
  ["github-classic", "gh" + "r_", 40, 40, "A"],
  ["aws-access-key", "AK" + "IA", 20, 20, "A"],
  ["aws-access-key", "AS" + "IA", 20, 20, "A"],
  ["groq-key", "gs" + "k_", 40, 128, "A"],
  ["xai-key", "xa" + "i-", 40, 256, "A"],
] as const;

test.each(prefixRules)("%s recognizes both length boundaries for %s", (ruleId, prefix, minimum, maximum, fill) => {
  for (const length of new Set([minimum, maximum])) {
    const token = prefix + fill.repeat(length - prefix.length);
    expect(only(`!${token}.`)).toEqual({ ruleId, line: 1, byteOffset: 1, sha256: hash(token) });
  }
});

test.each(prefixRules)("%s rejects short, long, and token-boundary near misses for %s", (_ruleId, prefix, minimum, maximum, fill) => {
  const short = prefix + fill.repeat(minimum - prefix.length - 1);
  const long = prefix + fill.repeat(maximum - prefix.length + 1);
  const minimumToken = prefix + fill.repeat(minimum - prefix.length);
  const maximumToken = prefix + fill.repeat(maximum - prefix.length);
  for (const candidate of [short, long, `a${minimumToken}`, `${maximumToken}_`, `${maximumToken}-`]) {
    expect(detectKnownSecrets(Buffer.from(candidate))).toEqual({ kind: "matches", matches: [] });
  }
});

test("prefix alphabets reject split and invalid continuations instead of joining them", () => {
  const openai = "sk-" + "proj-" + "A".repeat(32);
  const github = "gh" + "p_" + "A".repeat(36);
  const aws = "AK" + "IA" + "A".repeat(16);
  for (const candidate of [openai.slice(0, 5) + "\n" + openai.slice(5), github.slice(0, 2) + " " + github.slice(2), aws.slice(0, 8) + "-" + aws.slice(8)]) {
    expect(detectKnownSecrets(Buffer.from(candidate))).toEqual({ kind: "matches", matches: [] });
  }
});

test.each([
  ["sk-" + "proj-", 40, ["A", "Z", "a", "z", "0", "9", "_", "-"]],
  ["github_" + "pat_", 30, ["A", "Z", "a", "z", "0", "9", "_"]],
  ["gh" + "p_", 40, ["A", "Z", "a", "z", "0", "9"]],
  ["AK" + "IA", 20, ["A", "Z", "0", "9"]],
] as const)("the remaining alphabet for %s admits all boundary character classes", (prefix, length, characters) => {
  for (const character of characters) expect(only(prefix + character.repeat(length - prefix.length)).byteOffset).toBe(0);
});

const pemLabels = ["PRIVATE KEY", "ENCRYPTED PRIVATE KEY", "RSA PRIVATE KEY", "EC PRIVATE KEY", "DSA PRIVATE KEY", "OPENSSH PRIVATE KEY"] as const;
const pem = (label: string, body: string, newline = "\n"): string => `-----BEGIN ${label}-----${newline}${body}${newline}-----END ${label}-----`;

test.each(pemLabels)("recognizes a bounded %s block and hashes its exact raw bytes", (label) => {
  const block = pem(label, "A".repeat(64));
  expect(only(`before\r\n${block}\r\nafter`)).toEqual({ ruleId: "private-key", line: 2, byteOffset: 8, sha256: hash(block) });
});

test("PEM recognizes both body bounds and preserves CRLF in its digest", () => {
  for (const length of [64, 15_000]) {
    const block = pem("PRIVATE KEY", "A".repeat(length), "\r\n");
    expect(only(block).sha256).toBe(hash(block));
  }
});

test("PEM admits a complete 16,384-byte block and rejects one byte more", () => {
  const overhead = Buffer.byteLength(pem("PRIVATE KEY", ""));
  const body = "A".repeat(64) + " ".repeat(16_384 - overhead - 64);
  expect(only(pem("PRIVATE KEY", body)).sha256).toBe(hash(pem("PRIVATE KEY", body)));
  expect(detectKnownSecrets(Buffer.from(pem("PRIVATE KEY", `${body} `)))).toEqual({ kind: "matches", matches: [] });
});

test("PEM rejects malformed delimiters, bodies, body bounds, and complete blocks over the cap", () => {
  const cases = [
    pem("PRIVATE KEY", "A".repeat(63)),
    pem("PRIVATE KEY", "A".repeat(15_001)),
    `x${pem("PRIVATE KEY", "A".repeat(64))}`,
    pem("PRIVATE KEY", "A".repeat(64)) + "x",
    `-----BEGIN PRIVATE KEY-----\n${"A".repeat(64)}\n-----END RSA PRIVATE KEY-----`,
    `-----BEGIN PRIVATE KEY-----\n${"A".repeat(63)}!\n-----END PRIVATE KEY-----`,
    `-----BEGIN PRIVATE KEY-----\r${"A".repeat(64)}\r-----END PRIVATE KEY-----`,
    `-----BEGIN PRIVATE KEY-----\n${"A".repeat(64)}`,
    pem("PRIVATE KEY", "A".repeat(15_000).match(/.{1,2}/gu)?.join("\r\n") ?? ""),
  ];
  for (const candidate of cases) expect(detectKnownSecrets(Buffer.from(candidate))).toEqual({ kind: "matches", matches: [] });
});

const explicitSecretNames = [
  "AWS_ACCESS_KEY_ID", "AWS_BEARER_TOKEN_BEDROCK", "AWS_CONTAINER_AUTHORIZATION_TOKEN",
  "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "COPILOT_GITHUB_TOKEN", "HF_TOKEN",
] as const;
const expectedSecrets = [...CREDENTIAL_ENVIRONMENT_NAMES].filter((name) =>
  name.endsWith("_API_KEY") || name.endsWith("_AUTH_TOKEN") || name.endsWith("_OAUTH_TOKEN") || explicitSecretNames.includes(name as typeof explicitSecretNames[number]));

test("the scanner's selected names equal the defined secret-bearing subset of the shared Pi registry", () => {
  expect([...SECRET_CREDENTIAL_ENVIRONMENT_NAMES]).toEqual(expectedSecrets);
});

const assignmentForms = (name: string, value: string): string[] => [
  `export ${name}=${value} # shell`,
  `${name}=${value}`,
  `  ${name}: '${value}' # yaml`,
  `\"${name}\": \"${value}\", // object`,
];

test.each([...SECRET_CREDENTIAL_ENVIRONMENT_NAMES])("recognizes %s in all four assignment forms", (name) => {
  const value = `value-${"A".repeat(24)}`;
  for (const source of assignmentForms(name, value)) {
    const match = only(source);
    expect(match.ruleId).toBe("environment-assignment");
    expect(match.sha256).toBe(hash(value));
    expect(match.byteOffset).toBe(Buffer.byteLength(source.slice(0, source.indexOf(value))));
  }
});

test("assignment values accept their exact length bounds", () => {
  for (const length of [20, 4_096]) {
    const value = "v".repeat(length);
    expect(only(`OPENAI_API_KEY=${value}`).sha256).toBe(hash(value));
  }
});

test("assignment grammar accepts both quote styles and every object-key spelling", () => {
  const value = "v".repeat(20);
  for (const source of [
    `OPENAI_API_KEY='${value}'`, `OPENAI_API_KEY=\"${value}\"`,
    `OPENAI_API_KEY: \"${value}\"`, `OPENAI_API_KEY: '${value}'`,
    `OPENAI_API_KEY: '${value}', // bare object key`,
    `'OPENAI_API_KEY': \"${value}\"} // single-quoted object key`,
    `\"OPENAI_API_KEY\": '${value}' // double-quoted object key`,
  ]) expect(only(source).sha256).toBe(hash(value));
});

test("successful assignments suppress a nested provider-prefix result", () => {
  const value = "sk-" + "proj-" + "A".repeat(32);
  const result = detectKnownSecrets(Buffer.from(`OPENAI_API_KEY=\"${value}\"`));
  expect(result).toEqual({ kind: "matches", matches: [{ ruleId: "environment-assignment", line: 1, byteOffset: 16, sha256: hash(value) }] });
});

test("excluded or malformed assignments get ordinary provider-prefix scanning", () => {
  const value = "sk-" + "proj-" + "A".repeat(32);
  for (const source of [`OPENAI_API_KEY=\"${value}\" junk`, `OPENAI_API_KEY=\`${value}\``, `OPENAI_API_KEY=\"x\\${value}\"`]) {
    const result = detectKnownSecrets(Buffer.from(source));
    expect(result.kind).toBe("matches");
    if (result.kind === "matches") expect(result.matches.map(({ ruleId }) => ruleId)).toEqual(["openai-project"]);
  }
});

test("assignments reject value and grammar near misses", () => {
  const cases = [
    "OPENAI_API_KEY=" + "a".repeat(19),
    "OPENAI_API_KEY=" + "a".repeat(4_097),
    "OPENAI_API_KEY=redacted", "OPENAI_API_KEY=EXAMPLE", "OPENAI_API_KEY=placeholder",
    "OPENAI_API_KEY=not-a-secret", "OPENAI_API_KEY=xxxxxxxxxxxxxxxxxxxx", "OPENAI_API_KEY=********************",
    "OPENAI_API_KEY=....................", "OPENAI_API_KEY=<replace-with-real-key>",
    "openai_api_key=" + "a".repeat(20), `# OPENAI_API_KEY=${"a".repeat(20)}`,
    `OPENAI_API_KEY=\"${"a".repeat(20)}\\n\"`, `OPENAI_API_KEY=\`${"a".repeat(20)}\``,
    `OPENAI_API_KEY=\"${"a".repeat(20)}\";`, `OPENAI_API_KEY: ${"a".repeat(20)} trailing`,
    `'OPENAI_API_KEY': '${"a".repeat(20)}' trailing`,
  ];
  for (const candidate of cases) expect(detectKnownSecrets(Buffer.from(candidate))).toEqual({ kind: "matches", matches: [] });
});

const configurationNames = [...CREDENTIAL_ENVIRONMENT_NAMES].filter((name) => !SECRET_CREDENTIAL_ENVIRONMENT_NAMES.has(name));

test.each(configurationNames)("excluded configuration name %s stays unrecognized in all four assignment forms", (name) => {
  for (const source of assignmentForms(name, "a".repeat(20))) {
    expect(detectKnownSecrets(Buffer.from(source))).toEqual({ kind: "matches", matches: [] });
  }
});

test("the harmless credential placeholders already used by runtime tests remain below recognition bounds", () => {
  for (const value of ["sk-scratch", "sk-bare-string", "sk-bot-wiring-test", "sk-from-the-environment-not-the-file"]) {
    expect(detectKnownSecrets(Buffer.from(value))).toEqual({ kind: "matches", matches: [] });
  }
});

test("candidate admission is deterministic at encoding and size boundaries", () => {
  expect(detectKnownSecrets(Buffer.alloc(2_097_152, 0x61))).toEqual({ kind: "matches", matches: [] });
  expect(detectKnownSecrets(Buffer.alloc(2_097_153, 0x61))).toEqual({ kind: "candidate-too-large" });
  expect(detectKnownSecrets(Buffer.from([0x61, 0, 0x62]))).toEqual({ kind: "binary" });
  expect(detectKnownSecrets(Buffer.from([0xc3, 0x28]))).toEqual({ kind: "binary" });
});

test("the 100-match boundary returns facts and match 101 returns no partial data", () => {
  const token = "AK" + "IA" + "A".repeat(16);
  const hundred = Array.from({ length: 100 }, () => token).join("\n");
  const accepted = detectKnownSecrets(Buffer.from(hundred));
  expect(accepted.kind).toBe("matches");
  if (accepted.kind === "matches") expect(accepted.matches).toHaveLength(100);
  expect(detectKnownSecrets(Buffer.from(`${hundred}\n${token}`))).toEqual({ kind: "too-many-matches" });
});

test("results order by byte offset then rule id, with CRLF lines and multibyte prefixes counted in bytes", () => {
  const first = "AK" + "IA" + "A".repeat(16);
  const second = "gs" + "k_" + "B".repeat(36);
  const result = detectKnownSecrets(Buffer.from(`é${first}\r\n${second}`));
  expect(result).toEqual({ kind: "matches", matches: [
    { ruleId: "aws-access-key", line: 1, byteOffset: 2, sha256: hash(first) },
    { ruleId: "groq-key", line: 2, byteOffset: 24, sha256: hash(second) },
  ] });
});

test("formatter validates, clips, and never receives candidate bytes", () => {
  const match: SecretMatch = { ruleId: "openai-project", line: 3, byteOffset: 17, sha256: "0".repeat(64) };
  expect(formatSecretMatch("safe/path.txt", match)).toBe("secret: openai-project at safe/path.txt:3 (byte 17)\n");
  for (const label of ["", "/root", "a//b", "a/./b", "a/../b", "a\\b", "a\u0000b", "a\u007fb", "a\u0080b", "a\u2028b", "a\u2029b", "\ud800"]) {
    expect(formatSecretMatch(label, match)).toBe("label-invalid");
  }
  const clipped = formatSecretMatch(`${"é".repeat(260)}/file`, match);
  expect(clipped).not.toBe("label-invalid");
  if (clipped !== "label-invalid") {
    const label = clipped.slice(clipped.indexOf(" at ") + 4, clipped.indexOf(":3"));
    expect(Buffer.byteLength(label)).toBeLessThanOrEqual(512);
    expect(label.endsWith("...")).toBe(true);
    expect(Buffer.byteLength(clipped)).toBeLessThanOrEqual(1_024);
  }
});

test("results and diagnostics disclose no planted credential material", () => {
  const planted = "sk-" + "svcacct-" + "UniqueSecretMaterial".repeat(3);
  const result = detectKnownSecrets(Buffer.from(planted));
  const rendered = result.kind === "matches" && result.matches[0] !== undefined
    ? formatSecretMatch("fixture.txt", result.matches[0])
    : "";
  for (const output of [JSON.stringify(result), rendered]) {
    expect(output).not.toContain(planted);
    expect(output).not.toContain("UniqueSecretMaterial");
  }
});
