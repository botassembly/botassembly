export interface PoolResult<T> {
  values: (T | undefined)[];
  started: boolean[];
  concurrent: number;
  rejections?: { index: number; error: Error }[];
}

interface PoolSettlement<T> {
  value: T;
  stop: boolean;
}

function settlementError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error("Parallel worker rejected.", { cause: reason });
}

export async function runPool<I, O>(input: {
  items: readonly I[];
  width: number;
  cancelled: () => boolean;
  run: (item: I, index: number) => Promise<PoolSettlement<O>>;
}): Promise<PoolResult<O>> {
  const values: (O | undefined)[] = Array.from({ length: input.items.length });
  const started = input.items.map(() => false);
  let cursor = 0;
  let stop = false;
  let active = 0;
  let concurrent = 0;
  const rejections: NonNullable<PoolResult<O>["rejections"]> = [];

  const worker = async (): Promise<void> => {
    while (!stop && !input.cancelled()) {
      const index = cursor;
      const item = input.items[index];
      if (item === undefined) return;
      cursor += 1;
      started[index] = true;
      active += 1;
      concurrent = Math.max(concurrent, active);
      const settled = await Promise.resolve().then(() => input.run(item, index)).then(
        (result) => ({ result, error: undefined }),
        (reason: unknown) => ({ result: undefined, error: settlementError(reason) }),
      );
      active -= 1;
      if (settled.error !== undefined) {
        rejections.push({ index, error: settled.error });
        stop = true;
        continue;
      }
      values[index] = settled.result.value;
      stop ||= settled.result.stop;
    }
  };

  const count = Math.min(input.width, input.items.length);
  await Promise.all(Array.from({ length: count }, worker));
  return { values, started, concurrent, ...(rejections.length === 0 ? {} : { rejections }) };
}

/** The same pool for a caller that wants only the answers, in item order:
 *  nothing to cancel, nothing to stop early for, so every slot is filled. */
export async function mapPool<I, O>(items: readonly I[], width: number, run: (item: I) => Promise<O>): Promise<O[]> {
  const pool = await runPool({ items, width, cancelled: () => false, run: async (item) => ({ value: await run(item), stop: false }) });
  const rejection = pool.rejections?.[0];
  if (rejection !== undefined) throw rejection.error;
  return pool.values.filter((value) => value !== undefined);
}
