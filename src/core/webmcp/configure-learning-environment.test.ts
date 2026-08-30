import { describe, expect, it } from "vitest";

import { createP0WorkspaceRuntime } from "@/providers/p0";

import { ConfigureLearningEnvironmentService } from "./configure-learning-environment";
import { createEarlyWebMCPToolRegistry } from "./mock-handlers";

describe("ConfigureLearningEnvironmentService", () => {
  it("applies profile-neutral file, layout, option, viewport, and active-surface state once", async () => {
    const workspace = createP0WorkspaceRuntime();
    await workspace.controller.activateProfile("profile.vanilla-web");
    workspace.controller.replaceConsoleEntries([
      {
        id: "console.fixture",
        kind: "log",
        message: "Clear me",
        occurredAt: "2026-08-30T12:00:00.000Z",
      },
    ]);
    const service = new ConfigureLearningEnvironmentService(
      workspace.controller,
      workspace.registries,
    );

    const result = await service.execute({
      languageIds: [
        "language.html",
        "language.css",
        "language.javascript",
      ],
      visibleFiles: ["script.js"],
      activeFile: "script.js",
      activeSurfaceId: "editor",
      viewport: "mobile",
      transition: "animated",
      clearConsole: true,
      surfaces: [
        {
          id: "editor",
          options: [{ optionId: "editor.font-size", value: 18 }],
        },
        {
          id: "console",
          visible: false,
          order: 8,
        },
      ],
    });

    const state = workspace.store.getSnapshot();
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        status: "completed",
        revision: state.environmentRevision,
        data: expect.objectContaining({
          profileId: "profile.vanilla-web",
          runtimeProviderId: "runtime.sandpack-vanilla",
          visibleFiles: ["script.js"],
          activeFile: "script.js",
          activeSurfaceId: "editor",
          transition: "animated",
          evidence: {
            environmentRevision: state.environmentRevision,
            runtimeRevision: state.runtime.revision,
          },
        }),
      }),
    );
    expect(state.consoleEntries).toEqual([]);
    expect(state.surfaces).toHaveLength(5);
    expect(state.surfaces.find(({ id }) => id === "editor")?.options).toEqual(
      expect.objectContaining({ "editor.font-size": 18 }),
    );
    expect(state.surfaces.find(({ id }) => id === "preview")?.modeId).toBe(
      "mobile",
    );
    expect(state.surfaces.find(({ id }) => id === "console")).toEqual(
      expect.objectContaining({ visible: false, order: 8 }),
    );
  });

  it("switches profiles through the real registry integration instead of the mock handler", async () => {
    const workspace = createP0WorkspaceRuntime();
    await workspace.controller.activateProfile("profile.vanilla-web");
    const registry = createEarlyWebMCPToolRegistry(workspace.registries, {
      workspaceController: workspace.controller,
    });

    const result = await registry.invoke("configure_learning_environment", {
      profileId: "profile.javascript-console",
      runtimeProviderId: "runtime.sandpack-vanilla",
      activeFile: "script.js",
      activeSurfaceId: "editor",
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        status: "completed",
        data: expect.objectContaining({
          profileId: "profile.javascript-console",
          visibleFiles: ["script.js"],
        }),
      }),
    );
    expect(result.data).not.toEqual(
      expect.objectContaining({
        mock: true,
      }),
    );
    expect(workspace.store.getSnapshot()).toEqual(
      expect.objectContaining({
        profileId: "profile.javascript-console",
        activeFilePath: "script.js",
      }),
    );
  });

  it("rejects invalid surface options and unsupported post-actions before mutation", async () => {
    const workspace = createP0WorkspaceRuntime();
    await workspace.controller.activateProfile("profile.vanilla-web");
    const registry = createEarlyWebMCPToolRegistry(workspace.registries, {
      workspaceController: workspace.controller,
    });
    const previous = workspace.store.getSnapshot();

    const invalidOption = await registry.invoke(
      "configure_learning_environment",
      {
        surfaces: [
          {
            id: "editor",
            options: [{ optionId: "editor.font-size", value: 200 }],
          },
        ],
      },
    );
    expect(invalidOption).toEqual(
      expect.objectContaining({
        ok: false,
        status: "failed",
        error: expect.objectContaining({
          code: "invalid_capability_input",
          recoverable: true,
        }),
      }),
    );
    expect(workspace.store.getSnapshot()).toEqual(previous);

    const unsupportedAction = await registry.invoke(
      "configure_learning_environment",
      { actionAfter: "runtime.shell" },
    );
    expect(unsupportedAction).toEqual(
      expect.objectContaining({
        ok: false,
        status: "failed",
        error: expect.objectContaining({
          code: "unsupported_capability",
          supportedAlternatives: expect.arrayContaining(["runtime.run"]),
        }),
      }),
    );
    expect(workspace.store.getSnapshot()).toEqual(previous);
  });

  it("rejects an active surface that the same transaction hides", async () => {
    const workspace = createP0WorkspaceRuntime();
    await workspace.controller.activateProfile("profile.vanilla-web");
    const registry = createEarlyWebMCPToolRegistry(workspace.registries, {
      workspaceController: workspace.controller,
    });
    const previous = workspace.store.getSnapshot();

    const result = await registry.invoke("configure_learning_environment", {
      activeSurfaceId: "preview",
      surfaces: [{ id: "preview", visible: false }],
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: "invalid_environment_configuration",
          supportedAlternatives: expect.arrayContaining(["editor"]),
        }),
      }),
    );
    expect(workspace.store.getSnapshot()).toEqual(previous);
  });
});
