// Ticket 0286. One synthetic value for every credential-redaction fixture, so
// no test invents its own and none of them can be read as a real key. Each
// fixture appends its own suffix, and the planting helpers restore what they
// found, including finding nothing.
export const SYNTHETIC_CREDENTIAL = "synthetic-0286-not-a-credential";

function restoring(name: string, had: string | undefined): () => void {
  return () => {
    if (had === undefined) Reflect.deleteProperty(process.env, name);
    else process.env[name] = had;
  };
}

export function planted<Result>(name: string, value: string, body: () => Result): Result {
  const restore = restoring(name, process.env[name]);
  process.env[name] = value;
  try {
    return body();
  } finally {
    restore();
  }
}

export function planting<Result>(name: string, value: string, body: () => Promise<Result>): Promise<Result> {
  const restore = restoring(name, process.env[name]);
  process.env[name] = value;
  return body().then((held) => { restore(); return held; }, (reason: unknown) => { restore(); throw reason; });
}
