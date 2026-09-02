import { describe, expect, it } from "vitest";

import { createToolActivityPresentation } from "./tool-activity-presentation";

describe("createToolActivityPresentation", () => {
  it("omits discovery and inspection work from the learner timeline", () => {
    expect(createToolActivityPresentation("get_system_capabilities", {})).toBeUndefined();
    expect(createToolActivityPresentation("inspect_classroom", {})).toBeUndefined();
  });

  it("describes file changes without retaining file content", () => {
    const input = {
      operations: [
        {
          type: "create_file" as const,
          path: "variables.js",
          content: "private source content",
        },
      ],
      openAfter: "variables.js",
    };

    expect(
      createToolActivityPresentation("apply_workspace_changes", input, {
        status: "completed",
      }),
    ).toEqual({
      kind: "file",
      summary: "ChatGPT created and opened `variables.js`.",
      dedupeKey: "file:create:variables.js",
    });
    expect(JSON.stringify(createToolActivityPresentation("apply_workspace_changes", input))).not.toContain(
      "private source content",
    );
  });

  it("uses distinct console, execution, panel, success, and error presentations", () => {
    expect(
      createToolActivityPresentation(
        "execute_environment_action",
        { actionId: "runtime.clear-console" },
        { status: "completed" },
      ),
    ).toEqual(expect.objectContaining({
      kind: "console",
      summary: "ChatGPT cleared the console.",
    }));
    expect(
      createToolActivityPresentation(
        "execute_environment_action",
        { actionId: "runtime.run" },
        { status: "completed" },
      ),
    ).toEqual(expect.objectContaining({
      kind: "execution",
      summary: "ChatGPT ran the active workspace.",
    }));
    expect(
      createToolActivityPresentation(
        "configure_learning_environment",
        { activeSurfaceId: "surface.console" },
        { status: "completed" },
      ),
    ).toEqual(expect.objectContaining({
      kind: "panel",
      summary: "ChatGPT opened the console panel.",
    }));
    expect(
      createToolActivityPresentation(
        "evaluate_current_step",
        {},
        { status: "completed", data: { passed: true } },
      ),
    ).toEqual(expect.objectContaining({ kind: "success" }));
    expect(
      createToolActivityPresentation(
        "apply_workspace_changes",
        {
          operations: [
            { type: "replace_file", path: "variables.js", content: "" },
          ],
        },
        { status: "failed" },
      ),
    ).toEqual(expect.objectContaining({
      kind: "error",
      summary: "ChatGPT could not update `variables.js`.",
    }));
  });
});
