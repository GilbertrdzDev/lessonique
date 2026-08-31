import { describe, expect, it, vi } from "vitest";

import { DEFAULT_SYSTEM_LIMITS } from "@/core/platform/contracts";
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

  it("enforces file-count and byte limits before mutating runtime or state", async () => {
    const { controller, runtime, store } = createHarness();
    await controller.activateProfile("profile.vanilla-web");
    const previous = store.getSnapshot();
    vi.mocked(runtime.replaceFiles).mockClear();

    await expect(
      controller.replaceFiles(
        Array.from({ length: DEFAULT_SYSTEM_LIMITS.maxFiles + 1 }, (_, index) => ({
          path: `file-${index}.js`,
          languageId: "language.javascript",
          content: "",
          visible: true,
        })),
      ),
    ).rejects.toThrow(WorkspaceValidationError);
    await expect(
      controller.replaceFiles([
        {
          path: "script.js",
          languageId: "language.javascript",
          content: "x".repeat(DEFAULT_SYSTEM_LIMITS.maxFileBytes + 1),
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

  it("creates, renames, and deletes provider-supported learner files", async () => {
    const { controller, runtime, store } = createHarness();
    await controller.activateProfile("profile.vanilla-web");

    await controller.createFile("lessons/intro.js", "export const ready = true;");
    expect(store.getSnapshot()).toEqual(
      expect.objectContaining({
        activeFilePath: "lessons/intro.js",
        directories: ["lessons"],
      }),
    );
    expect(store.getSnapshot().files).toContainEqual(
      expect.objectContaining({
        path: "lessons/intro.js",
        languageId: "language.javascript",
      }),
    );

    await controller.renameFile("lessons/intro.js", "lessons/intro.css");
    expect(store.getSnapshot().activeFilePath).toBe("lessons/intro.css");
    expect(store.getSnapshot().files).toContainEqual(
      expect.objectContaining({
        path: "lessons/intro.css",
        languageId: "language.css",
      }),
    );

    await controller.deleteFile("lessons/intro.css");
    expect(store.getSnapshot().files).not.toContainEqual(
      expect.objectContaining({ path: "lessons/intro.css" }),
    );
    expect(store.getSnapshot().directories).toContain("lessons");
    expect(runtime.applyOperations).toHaveBeenCalled();
  });

  it("renames and recursively deletes folders as atomic runtime batches", async () => {
    const { controller, runtime, store } = createHarness();
    await controller.activateProfile("profile.vanilla-web");
    controller.createDirectory("components/cards/empty");
    await controller.createFile("components/cards/card.html", "<article></article>");
    await controller.createFile("components/cards/card.js", "export {};");

    await controller.renameDirectory("components", "ui");
    expect(store.getSnapshot()).toEqual(
      expect.objectContaining({
        activeFilePath: "ui/cards/card.js",
        directories: ["ui", "ui/cards", "ui/cards/empty"],
      }),
    );
    expect(store.getSnapshot().files.map(({ path }) => path)).toEqual(
      expect.arrayContaining(["ui/cards/card.html", "ui/cards/card.js"]),
    );
    const afterRename = store.getSnapshot();
    vi.mocked(runtime.applyOperations).mockClear();

    await expect(
      controller.renameDirectory("ui", "ui/cards/nested"),
    ).rejects.toThrow(/inside itself/u);
    expect(store.getSnapshot()).toEqual(afterRename);
    expect(runtime.applyOperations).not.toHaveBeenCalled();

    await controller.deleteDirectory("ui");
    expect(store.getSnapshot().directories).toEqual([]);
    expect(store.getSnapshot().files.every(({ path }) => !path.startsWith("ui/"))).toBe(
      true,
    );
  });

  it("rejects invalid entry paths, collisions, and read-only deletion without mutation", async () => {
    const { controller, runtime, store } = createHarness();
    await controller.activateProfile("profile.vanilla-web");
    const previous = store.getSnapshot();
    vi.mocked(runtime.applyOperations).mockClear();

    await expect(controller.createFile("notes.txt")).rejects.toThrow(
      /must use one of/u,
    );
    controller.createDirectory("src.js");
    expect(() => controller.createDirectory("src.js")).toThrow(/already exists/u);
    await expect(controller.renameFile("index.html", "src.js")).rejects.toThrow(
      /both a file and a folder/u,
    );
    expect(store.getSnapshot().files).toEqual(previous.files);
    expect(runtime.applyOperations).not.toHaveBeenCalled();

    await controller.replaceFiles([
      { ...previous.files[0]!, readOnly: true },
      ...previous.files.slice(1),
    ]);
    const readOnlyState = store.getSnapshot();
    await expect(controller.deleteFile("index.html")).rejects.toThrow(/read-only/u);
    expect(store.getSnapshot()).toEqual(readOnlyState);
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
    ["console", "values", "plan", "activity", "reference"].forEach((id) =>
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
    ["console", "values", "plan", "activity", "reference"].forEach((id) =>
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
        if (operation.type === "create") {
          files = [...files, { ...operation.file }];
        } else if (operation.type === "delete") {
          files = files.filter((file) => file.path !== operation.path);
        } else {
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
