import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseRunShow, scratchRoot } from "../smoke/run-show-facts.mjs";

const repository = dirname(dirname(fileURLToPath(import.meta.url)));

const stage = (overrides = {}) => ({
	identity: "01-work#1", stage: "01-work", repeat: 1, attempt: 1,
	state: "ended", exit: 0, cause: "success", scratch: "/tmp/scratch/abc/output",
	...overrides,
});

const subflow = (overrides = {}) => ({
	caller: "01-work#1", attempt: 1, call: 1, subflow: "child", item: null,
	started: true, child: "stages/01-work/1/1/subflows/1", exit: 0, cause: "success",
	...overrides,
});

const document = (overrides = {}) => ({
	schemaVersion: 1,
	kind: "bot.run.show",
	summary: {}, warnings: [],
	...overrides,
	data: {
		run: "run-a", state: "ended", startedAt: "2026-09-10T00:00:00.000Z",
		endedAt: "2026-09-10T00:00:01.000Z", exit: 0, cause: "success",
		stages: [stage()], subflows: [subflow()],
		...(overrides.data ?? {}),
	},
});

const encoded = (value) => `${JSON.stringify(value)}\n`;

test("run show facts accepts the supported shape and returns scratch roots", () => {
	const parsed = parseRunShow(encoded(document()), "run-a");
	assert.equal(parsed.data.run, "run-a");
	assert.deepEqual(scratchRoot(parsed), "/tmp/scratch/abc");
});

test("run show facts rejects malformed JSON and wrong root keys", () => {
	assert.match(parseRunShow("not-json", "run-a").error, /JSON/u);
	assert.match(parseRunShow(encoded({ ...document(), extra: true }), "run-a").error, /root keys/u);
	assert.match(parseRunShow(encoded({ ...document(), summary: undefined }), "run-a").error, /root keys/u);
});

test("run show facts rejects wrong schema, kind, and selected run", () => {
	assert.match(parseRunShow(encoded({ ...document(), schemaVersion: 2 }), "run-a").error, /schema/u);
	assert.match(parseRunShow(encoded({ ...document(), kind: "other" }), "run-a").error, /kind/u);
	assert.match(parseRunShow(encoded(document({ data: { run: "run-b" } })), "run-a").error, /selected run/u);
});

test("run show facts rejects missing and extra data, stage, and subflow keys", () => {
	const data = document().data;
	assert.match(parseRunShow(encoded({ ...document(), data: { ...data, extra: true } }), "run-a").error, /data keys/u);
	assert.match(parseRunShow(encoded({ ...document(), data: { ...data, stages: [{ ...stage(), extra: true }] } }), "run-a").error, /stage .*keys/u);
	assert.match(parseRunShow(encoded({ ...document(), data: { ...data, subflows: [{ ...subflow(), extra: true }] } }), "run-a").error, /subflow .*keys/u);
	assert.match(parseRunShow(encoded({ ...document(), data: { ...data, stages: undefined } }), "run-a").error, /data keys/u);
});

test("run show facts rejects wrong consumed types", () => {
	const cases = [
		["data.run", { data: { run: 1 } }],
		["data.state", { data: { state: null } }],
		["data.stages", { data: { stages: {} } }],
		["stage 0.identity", { data: { stages: [{ ...stage(), identity: 1 }] } }],
		["stage 0.repeat", { data: { stages: [{ ...stage(), repeat: "1" }] } }],
		["stage 0.scratch", { data: { stages: [{ ...stage(), scratch: 1 }] } }],
		["subflow 0.caller", { data: { subflows: [{ ...subflow(), caller: 1 }] } }],
		["subflow 0.started", { data: { subflows: [{ ...subflow(), started: "yes" }] } }],
		["subflow 0.child", { data: { subflows: [{ ...subflow(), child: 1 }] } }],
	];
	for (const [name, change] of cases) assert.match(parseRunShow(encoded(document(change)), "run-a").error, new RegExp(name, "u"));
});

test("duplicate keys fail at every supported object level", () => {
	const base = encoded(document());
	assert.match(parseRunShow(base.replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'), "run-a").error, /repeated JSON key/u);
	assert.match(parseRunShow(base.replace('"run":"run-a"', '"run":"run-a","run":"run-a"'), "run-a").error, /repeated JSON key/u);
	assert.match(parseRunShow(base.replace('"identity":"01-work#1"', '"identity":"01-work#1","identity":"01-work#1"'), "run-a").error, /repeated JSON key/u);
	assert.match(parseRunShow(base.replace('"caller":"01-work#1"', '"caller":"01-work#1","caller":"01-work#1"'), "run-a").error, /repeated JSON key/u);
});

test("braces, escaped quotes, and even backslashes inside strings remain strings", () => {
	const held = document({ data: { run: 'run-{"quoted":true}\\\\', stages: [stage({ identity: 'stage-{"quoted":true}\\\\', stage: 'stage-{"quoted":true}\\\\' })] } });
	assert.equal(parseRunShow(encoded(held), held.data.run).data.run, held.data.run);
});

test("scratch roots require one distinct parent and reject zero or conflicting roots", () => {
	assert.match(scratchRoot({ data: { stages: [], subflows: [] } }).error, /no scratch/u);
	assert.match(scratchRoot({ data: { stages: [stage({ scratch: "/one/a" }), stage({ scratch: "/other/path" })], subflows: [] } }).error, /scratch roots/u);
	assert.equal(scratchRoot({ data: { stages: [stage({ scratch: "/one/a" }), stage({ scratch: "/one/b" })], subflows: [] } }), "/one");
});

function executableSource(source) {
	return source.replace(/\/\*[\s\S]*?\*\//gu, "").split("\n").filter((line) => !/^\s*(?:#|\/\/)/u.test(line)).join("\n");
}

function scanSources(files) {
	const shell = /\bnode\s+["']?\$CLI["']?\s+show\s+["']?\$(?:\{[^}]+\}|[A-Za-z_][A-Za-z0-9_]*|[0-9]+)["']?/u;
	const module = /\bbot\(\s*["']show["']\s*,/u;
	for (const [path, source] of files) {
		const executable = executableSource(source);
		if (shell.test(executable) || module.test(executable)) throw new Error(`legacy bot show invocation in ${path}`);
	}
}

const retiredRoots = ["resume", "check", "runs", "show", "output", "draft", "rejected", "request", "capture", "logs", "session", "explain", "find", "status", "busy", "prune", "config", "models"];
const currentRunActions = ["start", "resume", "list", "show", "events", "check", "checklist", "record", "request", "output", "session"];

function scanSupportedLegacySources(files) {
	const roots = retiredRoots.join("|"), actions = currentRunActions.join("|");
	const shellWord = (word) => `(?:${word}|\x22${word}\x22|\x27${word}\x27)`;
	const shellCommand = `(?:${shellWord("bot")}|node\\s+(?:\\$CLI|\x22\\$CLI\x22|\x27\\$CLI\x27))`;
	const shellCommandStart = "(?<![A-Za-z0-9_$.-])";
	const shellRoot = new RegExp(shellCommandStart + shellCommand + "\\s+" + shellWord("(?:" + roots + ")") + "(?=\\s|[;&|)]|$)", "mu");
	const shellFlatRun = new RegExp(shellCommandStart + shellCommand + "\\s+" + shellWord("run") + "\\s+(?!" + shellWord("(?:" + actions + ")") + "(?=\\s|[`,;&|)]|$))\\S+", "mu");
	const shellBareGroup = new RegExp(shellCommandStart + shellCommand + "\\s+" + shellWord("(?:assembly|auth)") + "(?:\\s+" + shellWord("--help") + ")?\\s*(?=$|[;&|)])", "mu");
	const functionName = "[A-Za-z_$][A-Za-z0-9_$]*(?:\\.[A-Za-z_$][A-Za-z0-9_$]*)*";
	const quote = "[\\x22\\x27\\x60]";
	const rootLiteral = quote + "(?:" + roots + ")" + quote;
	const runLiteral = quote + "run" + quote;
	const actionLiteral = quote + "(?:" + actions + ")" + quote;
	const callRoot = new RegExp("\\bbot\\s*(?:\\?\\.)?\\(\\s*" + rootLiteral + "(?:\\s*[,)]|$)", "u");
	const callFlatRun = new RegExp("\\bbot\\s*(?:\\?\\.)?\\(\\s*" + runLiteral + "\\s*,(?!\\s*" + actionLiteral + ")", "u");
	const argumentPrefix = "(?:[^\\[\\]()\\n;]+,\\s*)?";
	const nonCommandCall = "(?!(?:git)\\s*\\()";
	const callStart = "(?<!new )(?<!\\.)\\b" + nonCommandCall + functionName + "\\s*(?:\\?\\.)?\\(\\s*" + argumentPrefix;
	const callArrayRoot = new RegExp(callStart + "\\[\\s*" + rootLiteral + "(?:\\s*[,\\]])", "u");
	const callArrayFlatRun = new RegExp(callStart + "\\[\\s*" + runLiteral + "(?:\\s*\\]|\\s*,(?!\\s*" + actionLiteral + "))", "u");
	const groupLiteral = quote + "(?:assembly|auth)" + quote;
	const helpLiteral = quote + "--help" + quote;
	const callArrayBareGroup = new RegExp(callStart + "\\[\\s*" + groupLiteral + "\\s*(?:,\\s*" + helpLiteral + "\\s*)?\\]", "u");
	const callBareGroup = new RegExp("\\bbot\\s*(?:\\?\\.)?\\(\\s*" + groupLiteral + "\\s*\\)", "u");
	const assignment = "(?<![A-Za-z0-9_$.])(?:const\\s+|let\\s+|var\\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\\s*=\\s*";
	const assigned = [
		new RegExp(assignment + "\\[\\s*" + rootLiteral + "(?:\\s*[,\\]])", "gu"),
		new RegExp(assignment + "\\[\\s*" + runLiteral + "(?:\\s*\\]|\\s*,(?!\\s*" + actionLiteral + "))", "gu"),
		new RegExp(assignment + "\\[\\s*" + groupLiteral + "\\s*(?:,\\s*" + helpLiteral + "\\s*)?\\]", "gu"),
	];
	for (const [path, source] of files) {
		const executable = executableSource(source);
		const shellPatterns = /(?:\.sh|\.bash)(?:#shell)?$/u.test(path) ? [shellRoot, shellFlatRun, shellBareGroup] : [];
		const patterns = [...shellPatterns, callRoot, callFlatRun, callArrayRoot, callArrayFlatRun, callBareGroup, callArrayBareGroup];
		const found = patterns.findIndex((pattern) => pattern.test(executable));
		if (found >= 0) throw new Error("retired bot invocation " + String(found) + " " + JSON.stringify(executable.match(patterns[found])?.[0]) + " in " + path);
		for (const pattern of assigned) {
			for (const match of executable.matchAll(pattern)) {
				const variable = match[1];
				if (variable === undefined) continue;
				const rest = executable.slice((match.index ?? 0) + match[0].length);
				const escaped = variable.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
				const passed = new RegExp("(?<!new )(?<!\\.)\\b" + nonCommandCall + functionName + "\\s*(?:\\?\\.)?\\([^;\\n)]*(?<![A-Za-z0-9_$])" + escaped + "(?![A-Za-z0-9_$])", "u");
				if (passed.test(rest)) throw new Error("retired bot invocation built in " + variable + " in " + path);
			}
		}
	}
}
function smokeFiles(directory, files = []) {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) smokeFiles(path, files);
		else if (entry.name.endsWith(".sh") || entry.name.endsWith(".mjs")) files.push([path, readFileSync(path, "utf8")]);
	}
	return files;
}

const maintainedRoots = [
	"README.md",
	"bot/src",
	"bot/tests",
	"scripts",
	"sdlc/project",
	"sdlc/scripts",
	"smoke",
	"examples",
	"docs/src/content/docs",
	"specification",
];

const excludedMaintainedPrefixes = [
	"sdlc/planning/archive/",
	"sdlc/records/",
];

const excludedMaintainedFiles = [
	"bot/tests/cli-legacy-retirement.test.ts", // explicit negative fixture
	"smoke/falsifications.md", // append-only experiment history
];

function isExcludedMaintainedPath(relativePath) {
	return excludedMaintainedPrefixes.some((prefix) => relativePath.startsWith(prefix))
		|| relativePath === "CHANGELOG.md"
		|| relativePath.endsWith("/CHANGELOG.md")
		|| excludedMaintainedFiles.includes(relativePath);
}

function maintainedFiles(path, files = []) {
	const relativePath = relative(repository, path).replaceAll("\\", "/");
	if (isExcludedMaintainedPath(relativePath)) return files;
	const entry = readdirSync(path, { withFileTypes: true });
	for (const item of entry) {
		const itemPath = join(path, item.name);
		const itemRelativePath = relative(repository, itemPath).replaceAll("\\", "/");
		if (isExcludedMaintainedPath(itemRelativePath)) continue;
		if (item.isDirectory()) maintainedFiles(itemPath, files);
		else if (/\.(?:md|mdx|mjs|sh|ts)$/u.test(item.name) && itemRelativePath !== "scripts/smoke-run-show-facts.test.mjs") {
			files.push([itemRelativePath, readFileSync(itemPath, "utf8")]);
		}
	}
	return files;
}

function activeDocumentationSource(source) {
	return source;
}

function scanMaintainedCallerInventory(files) {
	for (const [path, source] of files) {
		const documentation = path.endsWith(".md") || path.endsWith(".mdx");
		if (!documentation) {
			scanSupportedLegacySources([[path, source]]);
			continue;
		}
		const text = activeDocumentationSource(source);
		const fencedShell = [...text.matchAll(/```(?:sh|bash|shell)\s*\n(?<body>[\s\S]*?)```/giu)]
			.map((match) => [`${path}.sh#shell`, match.groups?.["body"] ?? ""]);
		scanSupportedLegacySources(fencedShell);
		const legacyPatterns = documentation ? [
			["retired root", new RegExp("`bot (?:" + retiredRoots.join("|") + ")(?:\\s|`)", "u")],
			["bot run TARGET", /`bot run (?!(?:start|resume|list|show|check|checklist|events|output|request|record|session)(?=\s|`))[^`\n]+`/u],
			["bot run TARGET", /(?:^|[ \t])bot run\s+(?=(?:\.{0,2}\/|[A-Za-z0-9_.-]+\/))[^\s`]+/mu],
			["bare group", /`bot (?:assembly|auth)`/u],
		] : [];
		for (const [name, pattern] of legacyPatterns) {
			if (!pattern.test(text)) continue;
			throw new Error(`supported legacy ${name} invocation in ${path}`);
		}
	}
}

test("the source guard rejects both legacy invocation syntaxes separately", () => {
	assert.throws(() => scanSources([["run.sh", 'node "$CLI" show "$run"']]), /legacy/u);
	assert.throws(() => scanSources([["validate.mjs", 'bot("show", run)']]), /legacy/u);
	assert.doesNotThrow(() => scanSources([["history.sh", '# node "$CLI" show "$run"'], ["history.mjs", '// bot("show", run)']]));
	const files = smokeFiles(join(repository, "smoke"));
	assert.ok(files.some(([path]) => path.endsWith(".sh")));
	assert.ok(files.some(([path]) => path.endsWith(".mjs")));
	scanSources(files);
});

test("the supported-command guard covers every executable legacy form", () => {
	const shell = [
		'node "$CLI" runs',
		'node "$CLI" output "$run"',
		'node "$CLI" request "$run"',
		'node "$CLI" models',
		'node "$CLI" auth',
		'node "$CLI" resume "$run"',
		'node "$CLI" session --raw "$run" "$stage"',
		'node "$CLI" run "$target"',
	];
	const module = [
		'bot("runs")',
		'bot("output", run)',
		'bot("request", run)',
		'bot("models")',
		'bot("auth")',
		'bot("resume", run)',
		'bot("session", "--raw", run, stage)',
		'bot("run", target)',
		'run(launcher, ["check", target])',
		'run(launcher, ["assembly"])',
		'run(launcher, ["output", run])',
		'run(launcher, ["session", "--raw", run, stage])',
	];
	for (const source of shell) assert.throws(() => scanSupportedLegacySources([["fixture.sh", source]]), /retired/u, source);
	for (const source of module) assert.throws(() => scanSupportedLegacySources([["fixture.mjs", source]]), /retired/u, source);
	assert.doesNotThrow(() => scanSupportedLegacySources([
		["fixture", 'run(launcher, ["assembly", "check", target])'],
		["current", 'bot("run", "session", run, stage, "--raw")'],
		["comment", '// bot("session", "--raw", run, stage)'],
	]));
});

test("the command guard finds retired shell roots in ordinary control and environment contexts", () => {
	for (const source of [
		"  bot runs",
		"\tbot runs",
		'bot "runs"',
		"bot 'runs'",
		'"bot" runs',
		"'bot' 'runs'",
		'bot "assembly"',
		"FOO=1 bot runs",
		"{ bot runs; }",
		"case x in x) bot runs;; esac",
		"elif bot runs",
		"exec bot runs",
		"(bot runs)",
		"! bot runs",
		"command bot runs",
		"if bot runs; then :; fi",
		"result=$(bot runs)",
		"env X=1 bot runs",
		"while bot runs; do :; done",
		'if node "$CLI" status; then :; fi',
	]) assert.throws(() => scanSupportedLegacySources([["fixture.sh", source]]), /retired/u, source);
	for (const source of [
		"bot run list",
		"bot assembly list",
		"bot auth list",
		"bot run start status/main",
		"robot runs",
		"my-bot runs",
		"other.bot runs",
		"bot runs-like",
	]) assert.doesNotThrow(() => scanSupportedLegacySources([["current.sh", source]]), source);
});

test("the command guard finds retired arguments built for any JavaScript helper", () => {
	for (const source of [
		'launch(["runs"])',
		"launch(['runs'])",
		"launch([`runs`])",
		'execute?.(prefix, ["output", run])',
		'runner.invoke?.([`status`])',
		'const oddlyNamed = [`runs`]; launch?.(oddlyNamed)',
		'oddlyNamed = ["models"]; launch(oddlyNamed)',
		'const argv = ["run", target]; dispatch(argv)',
		"const commandArgs = ['auth', '--help']; dispatch?.(commandArgs)",
		'custom(["status"])',
	]) assert.throws(() => scanSupportedLegacySources([["fixture.mjs", source]]), /retired/u, source);
	assert.doesNotThrow(() => scanSupportedLegacySources([["current.mjs", 'launch(["run", "events", run])']]));
	assert.doesNotThrow(() => scanSupportedLegacySources([["dynamic.mjs", 'const argv = [root]; argv.push(action); launch(argv)']]));
});

test("the maintained inventory rejects retired documentation and executable forms", () => {
	assert.throws(() => scanMaintainedCallerInventory([["active.md", "`bot output RUN`"]]), /retired root/u);
	assert.throws(() => scanMaintainedCallerInventory([["active.md", "`bot session --raw RUN STAGE`"]]), /retired root/u);
	assert.throws(() => scanMaintainedCallerInventory([["active.md", "`bot run session-old`"]]), /bot run TARGET/u);
	assert.throws(() => scanMaintainedCallerInventory([["active.md", "`bot run events-old RUN`"]]), /bot run TARGET/u);
	assert.throws(() => scanMaintainedCallerInventory([["active.md", "bot run ./triage/triage"]]), /bot run TARGET/u);
	assert.throws(() => scanMaintainedCallerInventory([["active.md", "`bot assembly` lists the home"]]), /bare group/u);
	assert.throws(() => scanMaintainedCallerInventory([["active.mjs", 'run(launcher, ["models"])']]), /retired/u);
	assert.throws(() => scanMaintainedCallerInventory([["active.mjs", 'run(launcher, ["auth", "--help"])']]), /retired/u);
	assert.doesNotThrow(() => scanMaintainedCallerInventory([["active.md", "`bot run session RUN STAGE --raw`"]]));
	assert.doesNotThrow(() => scanMaintainedCallerInventory([["active.md", "`bot run events`"]]));
	assert.throws(() => scanMaintainedCallerInventory([["compat.md", "## Legacy command compatibility\n\n`bot output RUN`"]]), /retired root/u);
	assert.throws(() => scanMaintainedCallerInventory([["active.md", "```sh\nif bot runs; then echo found; fi\n```"]]), /retired/u);
	assert.equal(existsSync(join(repository, "examples/runs")), false);
});

test("the smoke callers use the supported one-run JSON route", () => {
	for (const path of ["smoke/run.sh", "smoke/s5-works/validate.mjs", "smoke/s6-inspection/validate.mjs", "smoke/s10-lifecycle/validate.mjs"]) {
		const source = readFileSync(join(repository, path), "utf8");
		assert.match(source, /run\s+show/u, path);
		assert.match(source, /-j/u, path);
	}
});

test("maintained smoke callers use current command spellings", () => {
	scanSupportedLegacySources(smokeFiles(join(repository, "smoke")));
	const before = readFileSync(join(repository, "sdlc/project/before"), "utf8");
	const failure = readFileSync(join(repository, "sdlc/project/failure"), "utf8");
	const success = readFileSync(join(repository, "sdlc/project/success"), "utf8");
	assert.ok(before.includes('bot home busy "$1" --quiet'));
	assert.ok(failure.includes('"$BOT_CMD" home busy "$TREE" --quiet'));
	assert.ok(success.includes('"$BOT_CMD" run check "$RUN_ID" gate --file "$witness_file" --raw --home "$BOT_HOME"'));
});

test("maintained callers use current replacements outside smoke", () => {
	const files = maintainedRoots.flatMap((root) => {
		const path = join(repository, root);
		if (root === "README.md") return [[root, readFileSync(path, "utf8")]];
		return maintainedFiles(path);
	});
	scanMaintainedCallerInventory(files);
});
