import { readAssemblyTree, resolveInvocationTokens } from "./reader.ts";
import { runOnlyOptions, takeHome } from "./flags.ts";
import { resumeDonor, type ResumeDonor } from "./continuation.ts";
import { prehashAssembly } from "./record.ts";
import { runCommand, type RunDependencies } from "./run.ts";
import type { Refusal } from "./spine.ts";
import type { RunOperation } from "./run-command.ts";

interface ResumeBoundary {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdout(bytes: string | Uint8Array): void;
  stderr(bytes: string | Uint8Array): void;
}
interface Writers {
  usage(command: string, message: string): number;
  faults(faults: readonly Refusal[]): void;
}
interface ResumeArguments { donor: string; home: string; controls: string[]; idFile?: string }
interface PreparedResume { donor: ResumeDonor; resolved: Extract<ReturnType<typeof resolveInvocationTokens>, { status: "resolved" }>; idFile?: string }

function argumentsFor(args: string[], boundary: ResumeBoundary, writers: Writers): ResumeArguments | undefined {
  const options = runOnlyOptions(args);
  if (options.missing !== undefined) { writers.usage(options.missing, `Supply a value for ${options.missing}.`); return undefined; }
  if (options.script !== undefined) { writers.usage("resume", "Use only --home, --in, declared slots, and --id-file."); return undefined; }
  const selectedHome = takeHome(options.args, boundary.cwd, boundary.env);
  if (selectedHome.home === undefined) { writers.usage("--home", "Supply a value for --home."); return undefined; }
  const donor = selectedHome.args[0];
  if (donor === undefined || donor.startsWith("--")) { writers.usage("resume", "Give one donor run."); return undefined; }
  return { donor, home: selectedHome.home, controls: selectedHome.args.slice(1), ...(options.idFile === undefined ? {} : { idFile: options.idFile }) };
}

function changed(donor: ResumeDonor): Refusal {
  return { code: "request-invalid", path: donor.name, sentence: `Cannot resume from run ${donor.name}; the assembly changed since that run. Re-run fresh.` };
}
function donorTarget(donor: ResumeDonor): string { return donor.flow === undefined ? donor.assembly : `${donor.assembly}/${donor.flow}`; }

async function prepare(input: ResumeArguments, boundary: ResumeBoundary, writers: Writers): Promise<PreparedResume | undefined> {
  const donor = await resumeDonor(input.home, input.donor);
  if ("code" in donor) { writers.faults([donor]); return undefined; }
  const target = donorTarget(donor);
  const resolved = resolveInvocationTokens([target, "--home", input.home, ...input.controls], boundary.cwd, boundary.env);
  if (resolved.status === "refused") { writers.faults(resolved.result.faults ?? []); return undefined; }
  const admitted = readAssemblyTree(resolved, resolved.assemblyRoot, boundary.cwd, boundary.env);
  if (admitted.status === "refused") { writers.faults(admitted.result.faults ?? []); return undefined; }
  if (admitted.invocation.request !== undefined || Object.keys(admitted.invocation.commandOptions).length > 0) {
    writers.usage("resume", "Use only --home, --in, declared slots, and --id-file."); return undefined;
  }
  const hash = await prehashAssembly(resolved.assemblyRoot).then((held) => held.sha256, () => undefined);
  if (hash !== donor.assemblyHash) { writers.faults([changed(donor)]); return undefined; }
  return { donor, resolved, ...(input.idFile === undefined ? {} : { idFile: input.idFile }) };
}

export async function resumeOperation(
  args: string[], boundary: ResumeBoundary, dependencies: (idFile: string | undefined) => RunDependencies,
  correlation?: string,
): Promise<RunOperation> {
  let failure: Exclude<RunOperation, { kind: "result" }> | undefined;
  const writers: Writers = {
    usage: (command, message) => { failure = { kind: "usage", command, message }; return 2; },
    faults: (faults) => { failure = { kind: "faults", faults: [...faults] }; },
  };
  const input = argumentsFor(args, boundary, writers);
  if (input === undefined) return failure ?? { kind: "faults", faults: [] };
  const prepared = await prepare(input, boundary, writers);
  if (prepared === undefined) return failure ?? { kind: "faults", faults: [] };
  const result = await runCommand(
    prepared.resolved, prepared.donor.request, dependencies(prepared.idFile), prepared.donor, correlation,
  );
  return "faults" in result ? { kind: "faults", faults: result.faults } : { kind: "result", result };
}
