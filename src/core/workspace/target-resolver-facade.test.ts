import { describe, expect, it, vi } from "vitest";

import type { JsonValue } from "@/core/platform/json-schema";

import type { GuidanceTargetAdapter } from "./targeting";
import { TargetResolverFacade } from "./target-resolver-facade";
import { createP0ProviderPlatform } from "@/providers/p0";

const UNSAFE_INPUTS: Array<Record<string, JsonValue>> = [
  { selector: "button" },
  { cssSelector: "#run" },
  { xpath: "//button" },
  { domPath: "body/button[1]" },
  { x: 10, y: 20 },
  { coordinates: [10, 20] },
];

describe("TargetResolverFacade", () => {
  it.each(UNSAFE_INPUTS)("rejects unsafe target input before adapter access: %j", async (input) => {
    const registries = createP0ProviderPlatform();
    const adapter = createAdapter();
    const facade = new TargetResolverFacade(registries.targetResolvers, [adapter]);

    await expect(
      facade.resolve(
        { resolverId: "target.preview-anchor", input },
        new AbortController().signal,
      ),
    ).rejects.toThrow();

    expect(adapter.resolveTarget).not.toHaveBeenCalled();
  });

  it("delegates a valid closed semantic target", async () => {
    const registries = createP0ProviderPlatform();
    const adapter = createAdapter();
    const facade = new TargetResolverFacade(registries.targetResolvers, [adapter]);
    const target = {
      resolverId: "target.preview-anchor",
      input: { anchorId: "run.button" },
    };

    await facade.resolve(target, new AbortController().signal);

    expect(adapter.resolveTarget).toHaveBeenCalledWith(
      target,
      expect.any(AbortSignal),
    );
  });
});

function createAdapter(): GuidanceTargetAdapter {
  return {
    supportsTargetResolver: vi.fn(
      (resolverId) => resolverId === "target.preview-anchor",
    ),
    prepareTarget: vi.fn(async () => undefined),
    resolveTarget: vi.fn(async () => ({
      getSnapshot: () => ({ status: "lost" as const }),
      subscribe: () => () => undefined,
      dispose: () => undefined,
    })),
  };
}
