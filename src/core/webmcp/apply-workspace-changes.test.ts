import { describe, expect, it } from "vitest";

import { createP0WorkspaceRuntime } from "@/providers/p0";

import { createEarlyWebMCPToolRegistry } from "./mock-handlers";

describe("apply_workspace_changes", () => {
  it("applies every supported file operation as one validated batch", async () => {
    const runtime = createP0WorkspaceRuntime();
    await runtime.controller.activateProfile("profile.vanilla-web");
    const registry = createEarlyWebMCPToolRegistry(runtime.registries, {
      workspaceController: runtime.controller,
    });

    const result = await registry.invoke("apply_workspace_changes", {
      operations: [
        {
          type: "create_file",
          path: "helper.js",
          content: "export const ready = false;",
        },
        {
          type: "patch_file",
          path: "helper.js",
          edits: [
            {
              start: { line: 1, column: 22 },
              end: { line: 1, column: 27 },
              text: "true",
            },
          ],
        },
        {
          type: "replace_file",
          path: "styles.css",
          content: "body { color: rebeccapurple; }",
        },
        { type: "move_file", from: "script.js", to: "app.js" },
        { type: "remove_file", path: "index.html" },
      ],
      openAfter: "app.js",
      actionAfter: "surface.editor.focus",
    });

    const state = runtime.store.getSnapshot();
    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        status: "completed",
        revision: state.environmentRevision,
        data: expect.objectContaining({
          affectedFiles: [
            "helper.js",
            "styles.css",
            "script.js",
            "app.js",
            "index.html",
          ],
          activeFile: "app.js",
          action: expect.objectContaining({ accepted: true }),
          evidence: expect.objectContaining({ fileCount: 3 }),
        }),
      }),
    );
    expect(state.files.map(({ path }) => path)).toEqual([
      "styles.css",
      "helper.js",
      "app.js",
    ]);
    expect(state.files.find(({ path }) => path === "helper.js")?.content).toBe(
      "export const ready = true;",
    );
    expect(result.data).not.toEqual(expect.objectContaining({ mock: true }));
  });

  it("rejects an invalid later operation without applying the earlier edits", async () => {
    const runtime = createP0WorkspaceRuntime();
    await runtime.controller.activateProfile("profile.vanilla-web");
    const registry = createEarlyWebMCPToolRegistry(runtime.registries, {
      workspaceController: runtime.controller,
    });
    const previous = runtime.store.getSnapshot();

    const result = await registry.invoke("apply_workspace_changes", {
      operations: [
        {
          type: "replace_file",
          path: "styles.css",
          content: "body { color: red; }",
        },
        { type: "remove_file", path: "missing.js" },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        status: "failed",
        error: expect.objectContaining({ code: "invalid_workspace_changes" }),
      }),
    );
    expect(runtime.store.getSnapshot()).toEqual(previous);
  });

  it("validates patch ranges, resulting extensions, and post-actions before mutation", async () => {
    const runtime = createP0WorkspaceRuntime();
    await runtime.controller.activateProfile("profile.vanilla-web");
    const registry = createEarlyWebMCPToolRegistry(runtime.registries, {
      workspaceController: runtime.controller,
    });
    const previous = runtime.store.getSnapshot();

    const invalidPatch = await registry.invoke("apply_workspace_changes", {
      operations: [
        {
          type: "patch_file",
          path: "script.js",
          edits: [
            {
              start: { line: 20, column: 1 },
              end: { line: 20, column: 1 },
              text: "invalid",
            },
          ],
        },
      ],
    });
    expect(invalidPatch).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "invalid_workspace_changes" }),
      }),
    );

    const invalidMove = await registry.invoke("apply_workspace_changes", {
      operations: [{ type: "move_file", from: "script.js", to: "script.css" }],
    });
    expect(invalidMove).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "invalid_workspace_changes" }),
      }),
    );

    const invalidAction = await registry.invoke("apply_workspace_changes", {
      operations: [
        { type: "replace_file", path: "script.js", content: "void 0;" },
      ],
      actionAfter: "runtime.shell",
    });
    expect(invalidAction).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "unsupported_capability" }),
      }),
    );
    expect(runtime.store.getSnapshot()).toEqual(previous);
  });
});
