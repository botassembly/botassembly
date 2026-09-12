// Ticket 0017 — the hostile-provider harness. A provider scripted per test to
// misbehave in ways fauxProvider cannot express: a stream that never resolves,
// a mid-stream truncation that goes silent, a stream that ends with no final
// message, and a stream that only resolves after it is aborted. Ordinary
// (well-formed or error-message) steps delegate to fauxProvider unchanged.
// Time is a manual clock: nothing in these tests sleeps for real, and a test
// that would hang fails fast through bounded().
import {
  createAssistantMessageEventStream,
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  type AssistantMessage,
  type FauxResponseStep,
  type Model,
  type Provider,
  type StreamOptions,
} from "@earendil-works/pi-ai";
import type { StageRuntimeContext } from "../src/flow.ts";
import type { Invocation } from "../src/model.ts";

/** The minted output path; only a CHOOSE context lacks one (ticket 0034). */
export function outputOf(context: StageRuntimeContext): string {
  if (context.outputPath === undefined) throw new Error("this script runs work-mode nodes only");
  return context.outputPath;
}

/** The rung-bearing invocation a runFlow fixture carries: nothing authored, so
 *  every option resolves at its built-in rung (options.ts). */
export function bareInvocation(): Invocation {
  return { target: "", home: "", requestExtension: "txt", taskOptions: {}, commandOptions: {}, supplied: new Map(), valueless: new Set(), faults: [] };
}


/** Yield through the event loop until the probe holds; fail loudly if it never does. */
export async function waitFor(probe: () => boolean | Promise<boolean>): Promise<void> {
  for (let turn = 0; turn < 20_000; turn += 1) {
    if (await probe()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("waitFor: the probe never held");
}

/** Fail fast instead of hanging: reject when the promise outlives the real-time guard. */
export function bounded<T>(promise: Promise<T>, label: string, guardMs = 4_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const guard = setTimeout(() => { reject(new Error(`hung: ${label}`)); }, guardMs);
    promise.then(
      (value) => { clearTimeout(guard); resolve(value); },
      (reason: unknown) => { clearTimeout(guard); reject(reason instanceof Error ? reason : new Error(String(reason))); },
    );
  });
}

export type HostileStep =
  | FauxResponseStep
  | { hostile: "never" }
  | { hostile: "truncate"; settle?: Promise<AssistantMessage> }
  | { hostile: "end-empty"; settle?: Promise<AssistantMessage> }
  | { hostile: "after-abort"; message: AssistantMessage }
  | { hostile: "held"; settle: Promise<AssistantMessage> };

type HostileLifecycleState = "stream started" | "abort observed" | "stream settled";

interface LifecycleTrack {
  last: "not started" | HostileLifecycleState;
  order: HostileLifecycleState[];
  promises: Record<HostileLifecycleState, Promise<void>>;
  publish: Record<HostileLifecycleState, () => void>;
}

function lifecycleTrack(): LifecycleTrack {
  const publish = {} as LifecycleTrack["publish"];
  const promises = Object.fromEntries((["stream started", "abort observed", "stream settled"] as const).map((state) => [
    state,
    new Promise<void>((resolve) => { publish[state] = resolve; }),
  ])) as LifecycleTrack["promises"];
  return { last: "not started", order: [], promises, publish };
}

function observed(track: LifecycleTrack, state: HostileLifecycleState): void {
  if (track.order.includes(state)) return;
  track.last = state;
  track.order.push(state);
  track.publish[state]();
}

interface HostileLifecycle {
  last(invocation: number): LifecycleTrack["last"];
  order(invocation: number): readonly HostileLifecycleState[];
  await(invocation: number, state: HostileLifecycleState, guard: string, guardMs?: number): Promise<void>;
}

function special(step: HostileStep | undefined): step is Exclude<HostileStep, FauxResponseStep> {
  return typeof step === "object" && "hostile" in step;
}

function truncated(settle?: Promise<AssistantMessage>): ReturnType<typeof createAssistantMessageEventStream> {
  const held = createAssistantMessageEventStream();
  const partial: AssistantMessage = {
    ...fauxAssistantMessage("truncated"),
    stopReason: "pending",
    content: [{ type: "text", text: "trunc" }],
  };
  held.push({ type: "start", partial });
  held.push({ type: "text_start", contentIndex: 0, partial });
  held.push({ type: "text_delta", contentIndex: 0, delta: "trunc", partial });
  if (settle !== undefined) void settle.then((message) => {
    held.push({ type: "done", reason: "stop", message });
    held.end(message);
  });
  return held;
}

function afterAbort(message: AssistantMessage, signal: AbortSignal | undefined, abortObserved: () => void): ReturnType<typeof createAssistantMessageEventStream> {
  const held = createAssistantMessageEventStream();
  held.push({ type: "start", partial: { ...message, stopReason: "pending" } });
  const finish = (): void => {
    held.push({ type: "done", reason: "stop", message });
    held.end(message);
  };
  if (signal === undefined || signal.aborted) { abortObserved(); queueMicrotask(finish); }
  else signal.addEventListener("abort", () => { abortObserved(); queueMicrotask(finish); }, { once: true });
  return held;
}

// Ticket 0028: a stream that ignores abort entirely and ends only when the
// test settles it — the abandoned prompt that outlives the runtime's interest.
function held(settle: Promise<AssistantMessage>): ReturnType<typeof createAssistantMessageEventStream> {
  const stream = createAssistantMessageEventStream();
  void settle.then((message) => {
    stream.push({ type: "start", partial: { ...message, stopReason: "pending" } });
    stream.push({ type: "done", reason: "stop", message });
    stream.end(message);
  });
  return stream;
}

export interface HostileHandle {
  models: ReturnType<typeof createModels>;
  model: Model<string>;
  lifecycle: HostileLifecycle;
  append(steps: HostileStep[]): void;
}

/**
 * A Models collection whose one provider consumes the script one stream call
 * at a time: ordinary steps replay through fauxProvider, hostile steps build
 * their misbehaving streams directly against the pi-ai Provider interface.
 *
 * The chunk size is fixed rather than left at fauxProvider's 3-5 token default
 * because delta granularity is a property of the transport, not of anything
 * these tests assert. At the default a one-mebibyte scripted response is cut
 * into ~65,000 deltas, each a shallow message copy pushed through its own
 * microtask — ~1.2s of harness bookkeeping that made the oversized-response
 * test race bounded()'s real-time guard whenever the machine was busy. A
 * 1 KiB chunk still delivers that response incrementally, in ~1,000 deltas,
 * for ~19ms. Fixing min to max also keeps the split deterministic.
 */
export function hostileModels(script: HostileStep[]): HostileHandle {
  const base = fauxProvider({ tokenSize: { min: 256, max: 256 } });
  const steps = [...script];
  const tracks = script.map(() => lifecycleTrack());
  let invocation = 0;
  const stream = (model: Model<string>, context: Parameters<Provider["stream"]>[1], options?: StreamOptions & Record<string, unknown>): ReturnType<Provider["stream"]> => {
    invocation += 1;
    const track = tracks[invocation - 1] ?? lifecycleTrack();
    tracks[invocation - 1] = track;
    observed(track, "stream started");
    const step = steps.shift();
    let result: ReturnType<Provider["stream"]>;
    if (!special(step)) {
      base.setResponses(step === undefined ? [] : [step]);
      result = base.provider.stream(model, context, options);
    } else if (step.hostile === "never") {
      result = createAssistantMessageEventStream();
    } else if (step.hostile === "truncate") {
      result = truncated(step.settle);
    } else if (step.hostile === "end-empty") {
      const ended = createAssistantMessageEventStream();
      ended.end();
      if (step.settle !== undefined) void step.settle.then((message) => { ended.end(message); });
      result = ended;
    } else if (step.hostile === "held") {
      result = held(step.settle);
    } else {
      result = afterAbort(step.message, options?.signal, () => { observed(track, "abort observed"); });
    }
    void result.result().then(() => { observed(track, "stream settled"); });
    return result;
  };
  // The hostile stream accepts the one options shape the harness sends; the
  // cast back to Provider is a test-side convenience, not a claim src makes.
  const provider = { ...base.provider, stream, streamSimple: stream } as unknown as Provider;
  const models = createModels();
  models.setProvider(provider);
  const lifecycle: HostileLifecycle = {
    last: (expected) => tracks[expected - 1]?.last ?? "not started",
    order: (expected) => [...(tracks[expected - 1]?.order ?? [])],
    await: async (expected, state, guard, guardMs = 4_000) => {
      const track = tracks[expected - 1];
      if (track === undefined) throw new Error(`${guard}: expected invocation ${String(expected)} ${state}; last state: not scripted`);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`${guard}: expected invocation ${String(expected)} ${state}; last state: ${track.last}`));
        }, guardMs);
        void track.promises[state].then(
          () => { clearTimeout(timer); resolve(); },
          (reason: unknown) => {
            clearTimeout(timer);
            reject(reason instanceof Error ? reason : new Error(String(reason)));
          },
        );
      });
    },
  };
  return {
    models, model: base.getModel(), lifecycle,
    append: (more) => { steps.push(...more); tracks.push(...more.map(() => lifecycleTrack())); },
  };
}
