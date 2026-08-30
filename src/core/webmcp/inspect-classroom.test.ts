import { describe, expect, it } from "vitest";

import type { P0WorkspaceRuntime } from "@/providers/p0";
import {
  createP0WorkspaceRuntime,
  P0_VALIDATOR_IDS,
} from "@/providers/p0";

import { createEarlyWebMCPToolRegistry } from "./mock-handlers";

describe("inspect_classroom", () => {
  it("returns requested classroom sections without raw target or DOM state", async () => {
    const runtime = createP0WorkspaceRuntime();
    const registry = createRegistry(runtime);
    await createLesson(registry);
    runtime.controller.recordInteraction({
      id: "interaction.1",
      typeId: "interaction.preview-click",
      targetRef: {
        resolverId: "target.preview-anchor",
        input: { anchorId: "lesson.start" },
      },
      surfaceId: "preview",
      environmentRevision: runtime.store.getSnapshot().environmentRevision,
      occurredAt: "2026-08-30T00:00:00.000Z",
      summary: "Private learner payload is not returned.",
      outcome: "observed",
    });
    await runtime.validation.engine.evaluate({
      id: "condition.index",
      validatorId: P0_VALIDATOR_IDS.fileExists,
      input: { filePath: "index.html" },
    });

    const result = await registry.invoke("inspect_classroom", {
      include: [
        "lesson",
        "environment",
        "workspace",
        "file_contents",
        "validation",
        "runtime",
        "scene",
        "assistant",
        "interaction_targets",
        "activity",
      ],
      files: ["index.html"],
      maxActivity: 5,
    });

    expect(result).toEqual(
      expect.objectContaining({ ok: true, status: "completed" }),
    );
    const data = result.data as Record<string, unknown>;
    expect(data.lesson).toEqual(
      expect.objectContaining({ id: "lesson.inspect", status: "active" }),
    );
    expect(data.workspace).toEqual(
      expect.objectContaining({
        files: expect.arrayContaining([
          expect.objectContaining({ path: "index.html", bytes: expect.any(Number) }),
        ]),
      }),
    );
    expect(data.fileContents).toEqual([
      expect.objectContaining({
        path: "index.html",
        content: expect.stringContaining("lesson.start"),
      }),
    ]);
    expect(data.validation).toEqual([
      expect.objectContaining({
        conditionId: "condition.index",
        status: "passed",
        evidence: [expect.objectContaining({ expected: true })],
      }),
    ]);
    expect(data.scene).toEqual(
      expect.objectContaining({
        status: "idle",
        activeTarget: null,
      }),
    );
    expect(data.assistant).toEqual(
      expect.objectContaining({ status: "working", stateId: null }),
    );
    expect(data.interactionTargets).toEqual([
      expect.objectContaining({
        id: "interaction.1",
        target: {
          resolverId: "target.preview-anchor",
          input: { anchorId: "lesson.start" },
        },
      }),
    ]);
    const serialized = JSON.stringify(data);
    expect(serialized).not.toMatch(/geometry|domnode|keystroke|private learner payload/iu);
    await runtime.dispose();
  });

  it("queries registered source anchors and returns only mapped semantic targets", async () => {
    const runtime = createP0WorkspaceRuntime();
    const registry = createRegistry(runtime);
    await createLesson(registry);

    const result = await registry.invoke("inspect_classroom", {
      include: ["anchors", "diagnostics"],
      anchorQuery: {
        resolverId: "locator.html.element",
        input: { filePath: "index.html", tagName: "button" },
      },
    });

    expect(result.ok).toBe(true);
    const data = result.data as {
      anchors: Array<Record<string, unknown>>;
      diagnostics: unknown[];
    };
    expect(data.anchors).toEqual([
      expect.objectContaining({
        languageId: "language.html",
        locatorId: "locator.html.element",
        queryIntent: "html.element",
        targets: expect.arrayContaining([
          expect.objectContaining({ representation: "editor" }),
          expect.objectContaining({ representation: "preview" }),
        ]),
      }),
    ]);
    expect(JSON.stringify(data.anchors)).not.toMatch(/selector|xpath|dompath|geometry/iu);

    const unsafe = await registry.invoke("inspect_classroom", {
      include: ["anchors"],
      anchorQuery: {
        resolverId: "locator.html.element",
        input: { selector: "button" },
      },
    });
    expect(unsafe).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "invalid_input" }),
      }),
    );
    await runtime.dispose();
  });

  it("bounds normalized interaction targets with maxActivity", async () => {
    const runtime = createP0WorkspaceRuntime();
    const registry = createRegistry(runtime);
    await createLesson(registry);
    for (let index = 1; index <= 4; index += 1) {
      runtime.controller.recordInteraction({
        id: `interaction.${index}`,
        typeId: "interaction.surface-activate",
        surfaceId: "editor",
        environmentRevision: runtime.store.getSnapshot().environmentRevision,
        occurredAt: `2026-08-30T00:00:0${index}.000Z`,
      });
    }

    const result = await registry.invoke("inspect_classroom", {
      include: ["interaction_targets"],
      maxActivity: 2,
    });
    expect(
      (result.data as { interactionTargets: Array<{ id: string }> })
        .interactionTargets
        .map(({ id }) => id),
    ).toEqual(["interaction.3", "interaction.4"]);
    await runtime.dispose();
  });
});

function createRegistry(runtime: P0WorkspaceRuntime) {
  return createEarlyWebMCPToolRegistry(runtime.registries, {
    workspaceController: runtime.controller,
    createGuidedLesson: runtime.createGuidedLesson,
    resetClassroom: runtime.resetClassroom,
    lessonState: runtime.lessonStore,
    workspaceState: runtime.store,
    classroomLifecycle: runtime.classroomLifecycle,
    codeIntelligence: runtime.codeIntelligence.service,
    diagnostics: runtime.codeIntelligence.diagnostics,
    validationResults: runtime.validation.results,
  });
}

async function createLesson(
  registry: ReturnType<typeof createEarlyWebMCPToolRegistry>,
) {
  const result = await registry.invoke("create_guided_lesson", {
    lessonId: "lesson.inspect",
    title: "Inspect semantic state",
    objective: "Inspect a filtered classroom snapshot.",
    environment: { profileId: "profile.vanilla-web" },
    files: [
      {
        path: "index.html",
        languageId: "language.html",
        content:
          '<!doctype html><html><body><button data-lessonique-anchor="lesson.start">Start</button></body></html>',
      },
      {
        path: "styles.css",
        languageId: "language.css",
        content: "button { color: navy; }",
      },
      {
        path: "script.js",
        languageId: "language.javascript",
        content: "const ready = true;",
      },
    ],
    steps: [
      {
        id: "step.inspect",
        title: "Inspect",
        objective: "Inspect the active lesson.",
      },
    ],
  });
  expect(result.ok).toBe(true);
}
