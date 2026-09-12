import { ModelRuntime, type CreateModelRuntimeOptions } from "@earendil-works/pi-coding-agent";

type NativeRuntimeOptions = Omit<CreateModelRuntimeOptions, "authPath" | "credentials"> & (
  | { authPath: string }
  | { credentials: NonNullable<CreateModelRuntimeOptions["credentials"]> }
);

/** Construct Pi's native runtime without permitting ambient credential resolution. */
export function nativeModelRuntime(options: NativeRuntimeOptions): Promise<ModelRuntime> {
  return ModelRuntime.create(options);
}

export function isNativeModelRuntime(value: unknown): value is ModelRuntime {
  return value instanceof ModelRuntime;
}

export function nativeModelRuntimeIsConstructor(): boolean {
  return typeof ModelRuntime === "function";
}
