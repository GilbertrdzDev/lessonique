import { describe, expect, it, vi } from "vitest";

import { CapabilityCatalog } from "@/core/platform/capability-catalog";
import type {
  EnvironmentActionResult,
  RuntimeSnapshot,
} from "@/core/workspace/contracts";
import type { RuntimeAdapter } from "@/core/workspace/runtime-adapter";
import {
  InMemorySurfaceAdapter,
  SurfaceAdapterRegistry,
} from "@/core/workspace/surface-adapter";
import { WorkspaceStore } from "@/core/workspace/store";
import { WorkspaceController } from "@/core/workspace/workspace-controller";

import {
  createFakeProviderPlatform,
  FAKE_PROVIDER_IDS,
} from "./fake-provider-platform";

describe("Fake provider extensibility", () => {
  it("appears in capabilities with a surface option and actions", () => {
    const registries = createFakeProviderPlatform();
    const capabilities = new CapabilityCatalog(registries).getCapabilities();

    expect(capabilities.languages).toEqual([
      expect.objectContaining({ id: FAKE_PROVIDER_IDS.language }),
    ]);
    expect(capabilities.runtimes).toEqual([
      expect.objectContaining({ id: FAKE_PROVIDER_IDS.runtime }),
    ]);
    expect(capabilities.environmentProfiles).toEqual([
      expect.objectContaining({ id: FAKE_PROVIDER_IDS.profile }),
    ]);
    expect(capabilities.surfaces).toEqual([
      expect.objectContaining({
        id: FAKE_PROVIDER_IDS.surface,
        configurationOptions: [
          expect.objectContaining({
            id: FAKE_PROVIDER_IDS.surfaceOption,
            allowedValues: ["compact", "comfortable"],
          }),
        ],
        actions: [FAKE_PROVIDER_IDS.surfaceAction],
      }),
    ]);
  });

  it("adds a target resolver, anchor, and guidance effect through registries", () => {
    const registries = createFakeProviderPlatform();
    const capabilities = new CapabilityCatalog(registries).getCapabilities();

    expect(capabilities.targetResolvers).toEqual([
      expect.objectContaining({
        id: FAKE_PROVIDER_IDS.targetResolver,
        effects: [FAKE_PROVIDER_IDS.guidanceEffect],
      }),
    ]);
    expect(capabilities.sceneEffects).toEqual([
      expect.objectContaining({ id: FAKE_PROVIDER_IDS.guidanceEffect }),
    ]);
    expect(registries.interactionAnchors.list()).toEqual([
      expect.objectContaining({ id: FAKE_PROVIDER_IDS.interactionAnchor }),
    ]);
  });

  it("activates the fake profile through the unchanged core controller", async () => {
    const registries = createFakeProviderPlatform();
    const store = new WorkspaceStore();
    const surfaceAdapters = new SurfaceAdapterRegistry();
    surfaceAdapters.register(
      new InMemorySurfaceAdapter(FAKE_PROVIDER_IDS.surface),
    );
    const runtime = createFakeRuntime();
    const controller = new WorkspaceController({
      registries,
      store,
      surfaceAdapters,
      runtimeAdapters: { get: () => runtime },
    });

    await controller.activateProfile(FAKE_PROVIDER_IDS.profile);

    expect(store.getSnapshot()).toEqual(
      expect.objectContaining({
        profileId: FAKE_PROVIDER_IDS.profile,
        runtimeProviderId: FAKE_PROVIDER_IDS.runtime,
        languageIds: [FAKE_PROVIDER_IDS.language],
        activeFilePath: "lesson.fake",
      }),
    );
  });
});

function createFakeRuntime(): RuntimeAdapter {
  return {
    providerId: FAKE_PROVIDER_IDS.runtime,
    replaceFiles: vi.fn(async () => undefined),
    applyOperations: vi.fn(async () => undefined),
    executeAction: vi.fn(
      async (actionId): Promise<EnvironmentActionResult> => ({
        actionId,
        accepted: true,
        message: "Fake action completed.",
      }),
    ),
    getSnapshot: vi.fn(
      (): RuntimeSnapshot => ({
        providerId: FAKE_PROVIDER_IDS.runtime,
        status: "ready",
        revision: 1,
        files: [],
      }),
    ),
    dispose: vi.fn(async () => undefined),
  };
}
