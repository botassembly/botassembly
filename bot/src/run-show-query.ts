export interface RunShowQuery { prefix: string; json: boolean }

export function parseRunShow(args: readonly string[]): RunShowQuery | undefined {
  const jsonWords = args.filter((word) => word === "--json" || word === "-j");
  const rest = args.filter((word) => word !== "--json" && word !== "-j");
  if (jsonWords.length > 1 || rest.length !== 1 || rest[0]?.startsWith("--") !== false) return undefined;
  return { prefix: rest[0], json: jsonWords.length === 1 };
}
