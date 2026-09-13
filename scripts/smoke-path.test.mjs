import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { afterEach } from "node:test";

const scripts = dirname(fileURLToPath(import.meta.url));
const repository = dirname(scripts);
const driver = join(repository, "smoke", "run.sh");
const validator = join(repository, "smoke", "s6-inspection", "validate.mjs");
const scratchRoots = [];
const defaultSmokeRoot = "/tmp/bot-smoke";

afterEach(async () => {
	await Promise.all(scratchRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function credentialsRoot() {
	const root = await mkdtemp(join(tmpdir(), "bot-smoke-path-"));
	scratchRoots.push(root);
	await mkdir(join(root, "bot"), { recursive: true });
	await writeFile(join(root, "bot", "credentials.json"), JSON.stringify({
		"openai-codex": { type: "api_key" },
	}));
	return root;
}

function run(command, args, env) {
	return spawnSync(command, args, {
		cwd: repository,
		env,
		encoding: "utf8",
		timeout: 30_000,
	});
}

function sessionFrom(output) {
	const line = output.split("\n").find((held) => held.startsWith("smoke: scratch home "));
	assert.ok(line, `driver did not print its scratch home:\n${output}`);
	return line.slice("smoke: scratch home ".length).trim();
}

async function removeSession(output) {
	const session = sessionFrom(output);
	await rm(session, { recursive: true, force: true });
	return session;
}

test("a trailing TMPDIR reaches the empty-home assertion without an ownership refusal", async () => {
	const root = await credentialsRoot();
	const env = { ...process.env, TMPDIR: `${root}/`, XDG_CONFIG_HOME: root };
	delete env.SMOKE_HOME_ROOT;
	const result = run("bash", [driver, "6"], env);
	try {
		assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
		const session = sessionFrom(result.stdout);
		assert.equal(session.startsWith(join(root, "bot-smoke") + "/"), true, session);
		assert.equal(session.includes("//"), false, session);
		assert.match(result.stdout, /FAIL  bot run list returns the exact complete run document and rows/u);
		assert.doesNotMatch(result.stdout + result.stderr, /does not own|not the .* that \$SMOKE_SESSION names/u);
	} finally {
		await removeSession(result.stdout);
	}
});

test("an unset TMPDIR uses the default smoke root and reaches the empty-home assertion", async () => {
	const root = await credentialsRoot();
	const result = run("bash", [driver, "6"], (() => {
		const env = { ...process.env, XDG_CONFIG_HOME: root };
		delete env.TMPDIR;
		delete env.SMOKE_HOME_ROOT;
		return env;
	})());
	try {
		assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
		const session = sessionFrom(result.stdout);
		assert.equal(session.startsWith(`${defaultSmokeRoot}/`), true, session);
		assert.equal(session.includes("//"), false, session);
		assert.match(result.stdout, /FAIL  bot run list returns the exact complete run document and rows/u);
		assert.doesNotMatch(result.stdout + result.stderr, /does not own|not the .* that \$SMOKE_SESSION names/u);
	} finally {
		await removeSession(result.stdout);
	}
});

test("an explicit smoke root wins over TMPDIR and normalizes its trailing slash", async () => {
	const root = await credentialsRoot();
	const chosen = join(root, "chosen");
	const ignored = join(root, "ignored");
	const result = run("bash", [driver, "6"], {
		...process.env,
		TMPDIR: `${ignored}/`,
		SMOKE_HOME_ROOT: `${chosen}/`,
		XDG_CONFIG_HOME: root,
	});
	try {
		assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
		const session = sessionFrom(result.stdout);
		assert.equal(session.startsWith(`${chosen}/`), true, session);
		assert.equal(session.startsWith(`${ignored}/`), false, session);
		assert.equal(session.includes("//"), false, session);
		assert.match(result.stdout, /FAIL  bot run list returns the exact complete run document and rows/u);
		assert.doesNotMatch(result.stdout + result.stderr, /does not own|not the .* that \$SMOKE_SESSION names/u);
	} finally {
		await removeSession(result.stdout);
	}
});

test("the S6 validator refuses an existing home that does not match its session", async () => {
	const root = await credentialsRoot();
	const session = join(root, "session");
	const home = join(root, "other-home");
	await mkdir(join(session, "home"), { recursive: true });
	await mkdir(home, { recursive: true });
	const result = run(process.execPath, [validator], {
		...process.env,
		SMOKE_SESSION: session,
		BOT_HOME: home,
	});
	assert.equal(result.status, 2, `${result.stdout}\n${result.stderr}`);
	assert.equal(result.stdout, "");
	assert.match(result.stderr, /refusing to judge a home this session does not own/u);
	assert.match(result.stderr, /BOT_HOME is .*other-home/u);
	assert.equal(existsSync(home), true);
});
