#!/usr/bin/env node
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { helpScreen, newHelpScreen } from "./help.ts";
import { exitFlushed, ordinaryProcessOutput, processRawStdout } from "./process-output.ts";
import { dispatchNewCommand } from "./new-command-dispatch.ts";
import { processClock } from "./process-clock.ts";
import { readByteStream } from "./stdin.ts";
import { CLI_CONTRACTS } from "./cli-contract.ts";
import { runtimeBoundary, settleCommand, type CliBoundary } from "./cli-boundary.ts";

export type { CliBoundary } from "./cli-boundary.ts";

async function processStdin(): Promise<Buffer> {
  return readByteStream(process.stdin);
}

// The environment is bot's from here on (ticket 0139 leg 1). The boundary took
// a REFERENCE to `process.env` until now, which is no snapshot at all: this
// copies it, and then the one variable that is the runtime's own leaves the
// live process behind. Every rung that reads it reads the copy — the boundary
// is the only environment src/ has ever consulted — while Pi's request-time
// `process.env` reads, which no injected option reaches, find nothing to find.
// One process per run (ADR 0005) makes the deletion per-run by construction.
// One variable, and it is the only one: BOT_AUTH went with ADR 0017, and a name
// the runtime does not read is not the runtime's to take out of anyone's shell.
export function processBoundary(): CliBoundary {
  const env = { ...process.env };
  const clock = processClock();
  delete process.env["BOT_HOME"];
  // Build the ordinary queue here, so its stdout error listener is attached
  // before any command writes. Each write asks for it again, ending a raw latch.
  ordinaryProcessOutput();
  return runtimeBoundary({
    platform: process.platform,
    cwd: process.cwd(), env, stdinIsTTY: process.stdin.isTTY, stderrIsTTY: process.stderr.isTTY,
    readStdin: processStdin,
    stdout: (bytes) => { ordinaryProcessOutput().write(bytes); },
    rawStdout: () => processRawStdout(),
    stderr: (bytes) => { process.stderr.write(bytes); },
    clock,
  });
}

function usage(command: string, message: string, boundary: CliBoundary): number {
  boundary.stderr(`request-invalid  ${command}\n  ${message}\n`);
  return 2;
}

export const commandNames = CLI_CONTRACTS.map((descriptor) => descriptor.command.join(" "));

export function platformRefusal(platform: string): string | undefined {
  if (platform === "linux" || platform === "darwin") return undefined;
  if (platform === "win32") return "Bot does not support native Windows. Install WSL and run Bot inside its Linux shell.\n";
  return `Bot does not support ${platform}. Run Bot on Linux or macOS.\n`;
}

async function admittedMain(argv: string[], base: CliBoundary): Promise<number> {
  let warned = false;
  const boundary: CliBoundary = {
    ...base,
    beforeCredentialAccess: () => {
      if (warned) return;
      warned = true;
      if (base.retiredCredentialPath !== undefined) {
        if (lstatSync(base.retiredCredentialPath, { throwIfNoEntry: false }) !== undefined) {
          base.stderr("The retired Bot credential store is inactive; this command uses Pi's auth.json.\n");
        }
      }
      base.beforeCredentialAccess?.();
    },
  };
  const [command = ""] = argv;
  if (command === "--home") return usage("--home", "Put --home DIR after a command that accepts it. Example: bot run list --home ./bot-home.", boundary);
  const help = command.length === 0 || command === "--help" ? helpScreen("", []) : newHelpScreen(argv);
  if (help !== undefined) { boundary.stdout(help); return 0; }
  const newCommand = dispatchNewCommand(argv, boundary);
  if (newCommand !== undefined) return newCommand;
  return usage(command.length === 0 ? "bot" : command, `Use ${commandNames.join(", ")}.`, boundary);
}

export async function main(argv: string[], supplied?: CliBoundary): Promise<number> {
  const base = supplied ?? processBoundary();
  const refusal = platformRefusal(base.platform ?? process.platform);
  if (refusal !== undefined) { base.stderr(refusal); return 2; }
  return admittedMain(argv, base);
}

// upstream: pi-ai holds provider connections (global-fetch keep-alive sockets)
// with no public close/dispose, so a COMPLETE run can leave a live handle
// holding the event loop and the process never exits (0017 F4). Exiting is
// therefore explicit — but only after both stdio streams confirm their flush,
// so piped output reaches the kernel complete before exit can truncate it.
export { exitFlushed };

// Invoked, not imported. Both sides are resolved to their real path because
// node resolves a module URL through symlinks while argv[1] keeps the link it
// was invoked through, so comparing the two spellings made this false for every
// symlinked checkout or bin link — and `bot` a silent exit-0 no-op (0070). It
// stays false on import: an importer's argv[1] is its own entry, not this file.
// The existsSync is the predicate being total, not a guard: `node --eval` puts
// a bare word in argv[1], and a word that names no file cannot name this one.
const invoked = process.argv[1];
if (invoked !== undefined && existsSync(invoked) && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(invoked)) {
  void settleCommand(main(process.argv.slice(2)), (bytes) => { process.stderr.write(bytes); }).then(exitFlushed);
}
