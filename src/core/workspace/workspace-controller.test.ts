import { describe, expect, it, vi } from "vitest";

import { createP0ProviderPlatform } from "@/providers/p0";

import type {
  EnvironmentActionResult,
  RuntimeSnapshot,
  SurfaceState,
  WorkspaceFile,
  WorkspaceFileOperation,
} from "./contracts";
import type { RuntimeAdapter } from "./runtime-adapter";
import {
  InMemorySurfaceAdapter,
  SurfaceAdapterRegistry,
  type SurfaceAdapter,
} from "./surface-adapter";
import { WorkspaceStore } from "./store";
import {
  WorkspaceController,
  WorkspaceValidationError,
} from "./workspace-controller";

describe("WorkspaceController", () => {
  it("activates provider-defined profiles without hardcoded core modes", async () => {
    const { controller, store } = createHarness();

    await controller.activateProfile("profile.vanilla-web");

    expect(store.getSnapshot()).toEqual(
      expect.objectContaining({
        profileId: "profile.vanilla-web",
        runtimeProviderId: "runtime.sandpack-vanilla",
        languageIds: [
          "language.html",
          "language.css",
          "language.javascript",
        ],
        activeFilePath: "index.html",
        environmentRevision: 1,
      }),
    );
  });

  it("rejects an invalid file batch before mutating runtime or state", async () => {
    const { controller, runtime, store } = createHarness();
    await controller.activateProfile("profile.vanilla-web");
    const previous = store.getSnapshot();
    vi.mocked(runtime.replaceFiles).mockClear();

    await expect(
      controller.replaceFiles([
        {
          path: "../escape.html",
          languageId: "language.html",
          content: "",
          visible: true,
        },
      ]),
    ).rejects.toThrow(WorkspaceValidationError);

    expect(runtime.replaceFiles).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toEqual(previous);
  });

  it("applies valid file operations atomically through the runtime", async () => {
    const { controller, runtime, store } = createHarness();
    await controller.activateProfile("profile.javascript-console");

    await controller.updateFileContent("script.js", "console.log('ready');");

    expect(runtime.applyOperations).toHaveBeenCalledWith([
      {
        type: "update",
        path: "script.js",
        content: "console.log('ready');",
      },
    ]);
    expect(store.getSnapshot().files[0]?.content).toBe(
      "console.log('ready');",
    );
  });

  it("leaves surface state unchanged when an option is invalid", async () => {
    const { controller, store } = createHarness();
    await controller.activateProfile("profile.vanilla-web");
    const previous = store.getSnapshot();

    await expect(
      controller.configureSurfaces([
        {
          id: "editor",
          options: [{ optionId: "editor.font-size", value: 200 }],
        },
      ]),
    ).rejects.toThrow(/outside its allowed range/u);

    expect(store.getSnapshot()).toEqual(previous);
  });

  it("rejects actions that are not declared by the active profile", async () => {
    const { controller } = createHarness();
    await controller.activateProfile("profile.javascript-console");

    await expect(
      controller.executeAction("surface.preview.reload"),
    ).rejects.toThrow(/not allowed by profile/u);
  });

  it("rolls back every attempted surface when an adapter fails", async () => {
    const registries = createP0ProviderPlatform();
    const store = new WorkspaceStore();
    const surfaceAdapters = new SurfaceAdapterRegistry();
    const editor = createTransactionalSurfaceAdapter("editor");
    const preview = createTransactionalSurfaceAdapter("preview");
    surfaceAdapters.register(editor.adapter);
    surfaceAdapters.register(preview.adapter);
    ["console", "values", "plan", "activity"].forEach((id) =>
      surfaceAdapters.register(new InMemorySurfaceAdapter(id)),
    );
    const runtime = createRuntimeAdapter();
    const controller = new WorkspaceController({
      registries,
      store,
      surfaceAdapters,
      runtimeAdapters: { get: () => runtime },
    });
    await controller.activateProfile("profile.vanilla-web");
    const previousState = store.getSnapshot();
    const previousEditor = editor.adapter.getSnapshot();
    const previousPreview = preview.adapter.getSnapshot();
    preview.failNextConfiguration();

    await expect(
      controller.configureSurfaces(
        previousState.surfaces.map((surface) => ({
          id: surface.id,
          visible: surface.visible,
          order: surface.order,
          placementId: surface.placementId,
          modeId: surface.id === "preview" ? "mobile" : surface.modeId,
          options:
            surface.id === "editor"
              ? [{ optionId: "editor.font-size", value: 18 }]
              : [],
        })),
      ),
    ).rejects.toThrow("Surface configuration failed.");

    expect(store.getSnapshot()).toEqual(previousState);
    expect(editor.adapter.getSnapshot()).toEqual(previousEditor);
    expect(preview.adapter.getSnapshot()).toEqual(previousPreview);
  });

  it("restores runtime files when a full environment transaction cannot configure a surface", async () => {
    const registries = createP0ProviderPlatform();
    const store = new WorkspaceStore();
    const surfaceAdapters = new SurfaceAdapterRegistry();
    const editor = createTransactionalSurfaceAdapter("editor");
    const preview = createTransactionalSurfaceAdapter("preview");
    surfaceAdapters.register(editor.adapter);
    surfaceAdapters.register(preview.adapter);
    ["console", "values", "plan", "activity"].forEach((id) =>
      surfaceAdapters.register(new InMemorySurfaceAdapter(id)),
    );
    const runtime = createRuntimeAdapter();
    const controller = new WorkspaceController({
      registries,
      store,
      surfaceAdapters,
      runtimeAdapters: { get: () => runtime },
    });
    await controller.activateProfile("profile.vanilla-web");
    const previousState = store.getSnapshot();
    const previousRuntimeFiles = runtime.getSnapshot().files;
    preview.failNextConfiguration();

    await expect(
      controller.configureEnvironment({
        profileId: "profile.vanilla-web",
        runtimeProviderId: "runtime.sandpack-vanilla",
        languageIds: previousState.languageIds,
        files: previousState.files.map((file) => ({
          ...file,
          visible: file.path === "script.js",
        })),
        surfaces: previousState.surfaces.map((surface) => ({
          id: surface.id,
          visible: surface.visible,
          order: surface.order,
          placementId: surface.placementId,
          modeId: surface.id === "preview" ? "mobile" : surface.modeId,
          options: Object.entries(surface.options).map(([optionId, value]) => ({
            optionId,
            value,
          })),
        })),
        activeFilePath: "script.js",
        activeSurfaceId: "editor",
      }),
    ).rejects.toThrow("Surface configuration failed.");

    expect(store.getSnapshot()).toEqual(previousState);
    expect(runtime.getSnapshot().files).toEqual(previousRuntimeFiles);
  });
});

function createHarness() {
  const registries = createP0ProviderPlatform();
  const store = new WorkspaceStore();
  const surfaceAdapters = new SurfaceAdapterRegistry();
  registries.surfaces.list().forEach(({ id }) =>
    surfaceAdapters.register(new InMemorySurfaceAdapter(id)),
  );
  const runtime = createRuntimeAdapter();
  const controller = new WorkspaceController({
    store,
    registries,
    surfaceAdapters,
    runtimeAdapters: {
      get: () => runtime,
    },
  });
  return { controller, runtime, store, surfaceAdapters };
}

function createRuntimeAdapter(): RuntimeAdapter {
  let files: readonly WorkspaceFile[] = [];
  let revision = 0;
  return {
    providerId: "runtime.sandpack-vanilla",
    replaceFiles: vi.fn(async (nextFiles: readonly WorkspaceFile[]) => {
      files = nextFiles.map((file) => ({ ...file }));
      revision += 1;
    }),
    applyOperations: vi.fn(async (operations: readonly WorkspaceFileOperation[]) => {
      operations.forEach((operation) => {
        if (operation.type === "update") {
          files = files.map((file) =>
            file.path === operation.path
              ? { ...file, content: operation.content }
              : file,
          );
        }
      });
      revision += 1;
    }),
    executeAction: vi.fn(
      async (actionId): Promise<EnvironmentActionResult> => ({
        actionId,
        accepted: true,
        message: "Action accepted.",
      }),
    ),
    getSnapshot: vi.fn(
      (): RuntimeSnapshot => ({
        providerId: "runtime.sandpack-vanilla",
        status: "ready",
        revision,
        files,
      }),
    ),
    dispose: vi.fn(async () => undefined),
  };
}

function createTransactionalSurfaceAdapter(surfaceId: string): {
  adapter: SurfaceAdapter;
  failNextConfiguration(): void;
} {
  let configuration: SurfaceState | undefined;
  let shouldFail = false;
  const adapter: SurfaceAdapter = {
    surfaceId,
    configure: vi.fn(async (nextConfiguration) => {
      configuration = {
        ...nextConfiguration,
        options: { ...nextConfiguration.options },
      };
      if (shouldFail) {
        shouldFail = false;
        throw new Error("Surface configuration failed.");
      }
    }),
    executeAction: vi.fn(async (actionId) => ({
      actionId,
      accepted: true,
      message: "Surface action completed.",
    })),
    getSnapshot: () => ({
      surfaceId,
      ...(configuration ? { configuration } : {}),
    }),
  };
  return {
    adapter,
    failNextConfiguration() {
      shouldFail = true;
    },
  };
}
