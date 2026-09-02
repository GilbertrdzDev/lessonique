import { describe, expect, it } from "vitest";

import { GuideBuildService } from "@/core/guide-build";
import { createP0ProviderPlatform } from "@/providers/p0";

import { createEarlyWebMCPToolRegistry } from "./mock-handlers";

describe("set_guide_build_status", () => {
  it("advances real guide build stages through one public tool", async () => {
    const guideBuild = new GuideBuildService();
    const registry = createEarlyWebMCPToolRegistry(createP0ProviderPlatform(), {
      guideBuild,
    });

    const first = await registry.invoke("set_guide_build_status", {
      status: "building",
      stage: "understanding-goal",
    });
    const second = await registry.invoke("set_guide_build_status", {
      status: "building",
      stage: "preparing-lesson",
      message: "Generating content and examples",
    });

    expect(first).toMatchObject({
      ok: true,
      status: "completed",
      revision: 1,
      data: {
        guideBuildStatus: "building",
        stage: "understanding-goal",
        message: null,
        evidence: { revision: 1 },
      },
    });
    expect(second).toMatchObject({
      ok: true,
      revision: 2,
      data: {
        guideBuildStatus: "building",
        stage: "preparing-lesson",
        message: "Generating content and examples",
      },
    });
  });

  it("returns a compact recoverable error for an out-of-order stage", async () => {
    const registry = createEarlyWebMCPToolRegistry(createP0ProviderPlatform(), {
      guideBuild: new GuideBuildService(),
    });

    await expect(
      registry.invoke("set_guide_build_status", {
        status: "building",
        stage: "setting-up-classroom",
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: "failed",
      error: {
        code: "guide_build_stage_out_of_order",
        recoverable: true,
      },
    });
  });

  it("keeps build progress out of the learner activity timeline", async () => {
    const registry = createEarlyWebMCPToolRegistry(createP0ProviderPlatform(), {
      guideBuild: new GuideBuildService(),
    });

    await registry.invoke("set_guide_build_status", {
      status: "building",
      stage: "understanding-goal",
    });

    expect(registry.activityLogger.getSnapshot()).toHaveLength(1);
    expect(
      registry.activityLogger.getSnapshot()[0]?.presentation,
    ).toBeUndefined();
  });
});
