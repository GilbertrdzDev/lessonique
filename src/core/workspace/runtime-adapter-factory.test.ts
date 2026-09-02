import { describe, expect, it, vi } from "vitest";

import type { RuntimeSnapshot } from "./contracts";
import type { RuntimeAdapter } from "./runtime-adapter";
import {
  DuplicateRuntimeAdapterFactoryError,
  MissingRuntimeAdapterFactoryError,
  RuntimeAdapterFactory,
} from "./runtime-adapter-factory";

describe("RuntimeAdapterFactory", () => {
  it("lazily creates and reuses provider adapters", () => {
    const factory = new RuntimeAdapterFactory();
    const adapter = createAdapter("runtime.fake");
    const creator = vi.fn(() => adapter);
    factory.register("runtime.fake", creator);

    expect(factory.get("runtime.fake")).toBe(adapter);
    expect(factory.get("runtime.fake")).toBe(adapter);
    expect(creator).toHaveBeenCalledOnce();
  });

  it("rejects duplicate and missing provider factories", () => {
    const factory = new RuntimeAdapterFactory();
    factory.register("runtime.fake", () => createAdapter("runtime.fake"));

    expect(() =>
      factory.register("runtime.fake", () => createAdapter("runtime.fake")),
    ).toThrow(DuplicateRuntimeAdapterFactoryError);
    expect(() => factory.get("runtime.missing")).toThrow(
      MissingRuntimeAdapterFactoryError,
    );
  });
});

function createAdapter(providerId: string): RuntimeAdapter {
  return {
    providerId,
    replaceFiles: vi.fn(async () => undefined),
    applyOperations: vi.fn(async () => undefined),
    executeAction: vi.fn(async (actionId) => ({
      actionId,
      accepted: true,
      message: "Accepted.",
    })),
    getSnapshot: vi.fn((): RuntimeSnapshot => ({
      providerId,
      status: "idle",
      revision: 0,
      files: [],
    })),
    dispose: vi.fn(async () => undefined),
  };
}
