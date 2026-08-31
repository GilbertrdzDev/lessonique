import { describe, expect, it, vi } from "vitest";

import { createP0WorkspaceRuntime } from "@/providers/p0";

import { createEarlyWebMCPToolRegistry } from "./mock-handlers";

describe("execute_environment_action", () => {
  it("routes capability-declared runtime and surface actions through their owners", async () => {
    const runtime = createP0WorkspaceRuntime();
    const run = vi.fn(async () => undefined);
    runtime.sandpackRuntimeAdapter.attachHost({
      replaceFiles: vi.fn(async () => undefined),
      run,
      stop: vi.fn(async () => undefined),
      restart: vi.fn(async () => undefined),
      clearConsole: vi.fn(async () => undefined),
    });
    await runtime.controller.activateProfile("profile.vanilla-web");
    const registry = createEarlyWebMCPToolRegistry(runtime.registries, {
      workspaceController: runtime.controller,
    });

    const runtimeResult = await registry.invoke("execute_environment_action", {
      actionId: "runtime.run",
      waitForCompletion: true,
    });
    const surfaceResult = await registry.invoke("execute_environment_action", {
      actionId: "surface.editor.focus",
    });

    expect(runtimeResult).toEqual(
      expect.objectContaining({
        ok: true,
        status: "completed",
        data: expect.objectContaining({
          actionId: "runtime.run",
          ownerType: "runtime",
          ownerId: "runtime.sandpack-vanilla",
          accepted: true,
          waitForCompletion: true,
        }),
      }),
    );
    expect(surfaceResult).toEqual(
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({
          ownerType: "surface",
          ownerId: "editor",
        }),
      }),
    );
    expect(run).toHaveBeenCalledOnce();
    expect(runtimeResult.data).not.toEqual(expect.objectContaining({ mock: true }));
  });

  it("rejects unavailable actions and closed-schema input before adapter execution", async () => {
    const runtime = createP0WorkspaceRuntime();
    await runtime.controller.activateProfile("profile.javascript-console");
    const registry = createEarlyWebMCPToolRegistry(runtime.registries, {
      workspaceController: runtime.controller,
    });

    const unavailable = await registry.invoke("execute_environment_action", {
      actionId: "surface.preview.reload",
    });
    const invalidInput = await registry.invoke("execute_environment_action", {
      actionId: "runtime.run",
      input: { command: "whoami" },
    });

    expect(unavailable).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: "unsupported_capability",
          supportedAlternatives: expect.arrayContaining(["runtime.run"]),
        }),
      }),
    );
    expect(invalidInput).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "invalid_capability_input" }),
      }),
    );
  });
});
