import { describe, expect, it, vi } from "vitest";

import { createP0WorkspaceRuntime } from "@/providers/p0";

import { createEarlyWebMCPToolRegistry } from "./mock-handlers";

describe("classroom WebMCP tools", () => {
  it("creates and replaces a real guided lesson through the shared runtime", async () => {
    const runtime = createP0WorkspaceRuntime();
    const registry = createRegistry(runtime);
    runtime.classroomLifecycle.register({
      id: "scene.previous",
      kind: "scene",
      dispose: vi.fn(),
    });

    const result = await registry.invoke(
      "create_guided_lesson",
      createLessonInput("lesson.first"),
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        status: "completed",
        revision: runtime.lessonStore.getSnapshot().revision,
        data: expect.objectContaining({
          lesson: {
            id: "lesson.first",
            mode: "mixed",
            status: "active",
            activeStepId: "step.1",
            stepCount: 3,
            progress: 0,
          },
          environment: expect.objectContaining({
            profileId: "profile.vanilla-web",
            runtimeProviderId: "runtime.sandpack-vanilla",
            activeFile: "index.html",
            activeSurfaceId: "editor",
          }),
          evidence: expect.objectContaining({ lifecycleResources: 0 }),
        }),
      }),
    );
    expect(runtime.store.getSnapshot().files.map(({ path }) => path)).toEqual([
      "index.html",
      "styles.css",
      "script.js",
    ]);
    expect(runtime.guideBuild.store.getSnapshot()).toMatchObject({
      status: "completed",
      stage: "setting-up-classroom",
    });
  });

  it("validates and starts an initial scene as part of guided lesson creation", async () => {
    const runtime = createP0WorkspaceRuntime();
    const registry = createRegistry(runtime);
    const input = createLessonInput("lesson.scene");
    input.initialScene = {
      id: "scene.initial",
      beats: [
        {
          id: "beat.1",
          type: "explanation",
          guide: { body: "Welcome to the lesson." },
        },
      ],
    };

    const result = await registry.invoke("create_guided_lesson", input);

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        status: "completed",
        data: expect.objectContaining({
          scene: expect.objectContaining({
            sceneId: "scene.initial",
            sceneStatus: "preparing",
          }),
        }),
      }),
    );
    expect(runtime.lessonStore.getSnapshot().status).toBe("active");
    expect(runtime.store.getSnapshot().status).toBe("ready");
    expect(runtime.scene.store.getSnapshot().id).toBe("scene.initial");
    await runtime.scene.runner.control("cancel", "scene.initial");
  });

  it("rejects invalid capability input before replacing an active lesson", async () => {
    const runtime = createP0WorkspaceRuntime();
    const registry = createRegistry(runtime);
    await registry.invoke("create_guided_lesson", createLessonInput("lesson.previous"));
    const previousLesson = runtime.lessonStore.getSnapshot();
    const previousWorkspace = runtime.store.getSnapshot();
    const invalid = createLessonInput("lesson.invalid");
    invalid.environment.surfaces = [
      {
        id: "editor",
        options: [{ optionId: "editor.font-size", value: 200 }],
      },
    ];

    const result = await registry.invoke("create_guided_lesson", invalid);

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: "invalid_capability_input",
          recoverable: true,
        }),
      }),
    );
    expect(runtime.lessonStore.getSnapshot()).toBe(previousLesson);
    expect(runtime.store.getSnapshot()).toBe(previousWorkspace);
    expect(runtime.guideBuild.store.getSnapshot()).toMatchObject({
      status: "error",
      message: expect.stringContaining("editor.font-size"),
    });
  });

  it("rejects an invalid initial scene before creating partial classroom state", async () => {
    const runtime = createP0WorkspaceRuntime();
    const registry = createRegistry(runtime);
    const input = createLessonInput("lesson.invalid-scene");
    input.initialScene = {
      id: "scene.invalid",
      beats: [
        {
          id: "beat.invalid",
          type: "explanation",
          target: {
            resolverId: "target.surface-anchor",
            input: { anchorId: "anchor.learning-plan" },
          },
          effects: [{ effectId: "effect.unregistered" }],
        },
      ],
    };

    const result = await registry.invoke("create_guided_lesson", input);

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "invalid_teaching_scene" }),
      }),
    );
    expect(runtime.lessonStore.getSnapshot().status).toBe("idle");
    expect(runtime.store.getSnapshot().status).toBe("idle");
    expect(runtime.scene.store.getSnapshot().status).toBe("idle");
    expect(runtime.guideBuild.store.getSnapshot()).toMatchObject({
      status: "error",
    });
  });

  it("resets the classroom idempotently through the real lifecycle", async () => {
    const runtime = createP0WorkspaceRuntime();
    const registry = createRegistry(runtime);
    await registry.invoke("create_guided_lesson", createLessonInput("lesson.reset"));
    runtime.classroomLifecycle.register({
      id: "timer.active",
      kind: "timer",
      dispose: vi.fn(),
    });

    const first = await registry.invoke("reset_classroom", { scope: "all" });
    const second = await registry.invoke("reset_classroom", { scope: "all" });

    expect(first).toEqual(
      expect.objectContaining({
        ok: true,
        status: "completed",
        data: expect.objectContaining({
          scope: "all",
          lessonStatus: "idle",
          workspaceStatus: "idle",
          resourcesRemaining: 0,
        }),
      }),
    );
    expect(second).toEqual(
      expect.objectContaining({ ok: true, status: "completed" }),
    );
    expect(runtime.lessonStore.getSnapshot().plan.steps).toEqual([]);
    expect(runtime.store.getSnapshot().files).toEqual([]);
    expect(runtime.classroomLifecycle.getSnapshot().total).toBe(0);
    expect(runtime.guideBuild.store.getSnapshot().status).toBe("idle");
  });
});

function createRegistry(runtime: ReturnType<typeof createP0WorkspaceRuntime>) {
  return createEarlyWebMCPToolRegistry(runtime.registries, {
    workspaceController: runtime.controller,
    createGuidedLesson: runtime.createGuidedLesson,
    resetClassroom: runtime.resetClassroom,
    sceneRunner: runtime.scene.runner,
    sceneState: runtime.scene.store,
    classroomLifecycle: runtime.classroomLifecycle,
    guideBuild: runtime.guideBuild,
  });
}

function createLessonInput(lessonId: string) {
  return {
    lessonId,
    lessonMode: "mixed" as const,
    title: "Web foundations",
    objective: "Build a small provider-neutral web exercise.",
    environment: {
      profileId: "profile.vanilla-web",
      languageIds: [
        "language.html",
        "language.css",
        "language.javascript",
      ],
      activeFile: "index.html",
      activeSurfaceId: "editor",
      surfaces: [] as Array<{
        id: string;
        options?: Array<{ optionId: string; value: string | number | boolean }>;
      }>,
    },
    files: [
      {
        path: "index.html",
        languageId: "language.html",
        content: "<main id=\"app\"></main>",
      },
      {
        path: "styles.css",
        languageId: "language.css",
        content: "#app { color: rebeccapurple; }",
      },
      {
        path: "script.js",
        languageId: "language.javascript",
        content: "document.querySelector('#app').textContent = 'Ready';",
      },
    ],
    steps: [1, 2, 3].map((number) => ({
      id: `step.${number}`,
      title: `Step ${number}`,
      objective: `Complete step ${number}.`,
      hints: [`Hint ${number}`],
    })),
    initialScene: undefined as
      | undefined
      | {
          id: string;
          beats: Array<{
            id: string;
            type: "explanation" | "interaction" | "validation" | "feedback";
            guide?: { body: string };
            target?: { resolverId: string; input: Record<string, string> };
            effects?: Array<{ effectId: string }>;
          }>;
        },
  };
}
