import type { EventEmitter } from "node:events";

export interface ProcessOutcome {
  code: number | null;
  signal: NodeJS.Signals | null;
}

export interface RunCoverageOptions {
  workingDirectory?: string;
  sourceRoot?: string;
  retainedDirectory?: string;
  createOwnedDirectory?: () => Promise<string>;
  producer?: (reportsDirectory: string) => Promise<ProcessOutcome>;
  verifier?: (summaryFile: string, sourceRoot: string) => Promise<{ files: number }>;
  publisher?: (summaryFile: string, retainedDirectory: string) => Promise<void>;
  cleanup?: (ownedDirectory: string) => Promise<void>;
  diagnostic?: (message: string) => void;
  announcement?: (result: { files: number }) => void;
}

export interface CoverageProducerOptions {
  workingDirectory?: string;
  spawnChild?: (command: string, args: string[], options: { cwd: string; stdio: "inherit" }) => Pick<EventEmitter, "once">;
}

export interface PublicationOperations {
  copyFile?: (source: string, destination: string) => Promise<void>;
  renameFile?: (source: string, destination: string) => Promise<void>;
  removeFile?: (path: string) => Promise<void>;
  makeDirectory?: (path: string, options: { recursive: true }) => Promise<unknown>;
}

export class CoveragePublicationError extends Error {
  readonly publicationCause: unknown;
  readonly stagingCleanupCause: unknown;
  constructor(publicationCause: unknown, stagingCleanupCause: unknown);
}

export function waitForClose(child: Pick<EventEmitter, "once">): Promise<ProcessOutcome>;
export function coverageProducer(reportsDirectory: string, options?: CoverageProducerOptions): Promise<ProcessOutcome>;
export function publishCoverageSummary(summaryFile: string, retainedDirectory: string, operations?: PublicationOperations): Promise<void>;
export function runCoverage(options?: RunCoverageOptions): Promise<number>;
