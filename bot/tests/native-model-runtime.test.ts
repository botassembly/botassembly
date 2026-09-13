import type { CredentialStore } from "@earendil-works/pi-ai";
import { expectTypeOf, test } from "vitest";
import { nativeModelRuntime } from "./support/native-model-runtime.ts";

type NativeRuntimeOptions = Parameters<typeof nativeModelRuntime>[0];

test("the native runtime helper type requires an explicit credential boundary", () => {
  expectTypeOf<{ authPath: string; modelsPath: null }>().toExtend<NativeRuntimeOptions>();
  expectTypeOf<{ credentials: CredentialStore; modelsPath: null }>().toExtend<NativeRuntimeOptions>();
  expectTypeOf<{ modelsPath: null }>().not.toExtend<NativeRuntimeOptions>();
});
