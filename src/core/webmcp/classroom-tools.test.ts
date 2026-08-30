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
  });

  it("rejects unavailable initial scenes without creating partial state", async () => {
    const runtime = createP0WorkspaceRuntime();
    const registry = createRegistry(runtime);
    const input = createLessonInput("lesson.scene");
    input.initialScene = {
      id: "scene.initial",
      beats: [
        {
          id: "beat.1",
          guide: { body: "Welcome to the lesson." },
        },
      ],
    };

    const result = await registry.invoke("create_guided_lesson", input);

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        status: "failed",
        error: {
          code: "scene_engine_unavailable",
          message:
            "Create the guided lesson without initialScene until the scene engine is available.",
          recoverable: true,
          supportedAlternatives: ["omit initialScene"],
        },
      }),
    );
    expect(runtime.lessonStore.getSnapshot().status).toBe("idle");
    expect(runtime.store.getSnapshot().status).toBe("idle");
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
  });
});

function createRegistry(runtime: ReturnType<typeof createP0WorkspaceRuntime>) {
  return createEarlyWebMCPToolRegistry(runtime.registries, {
    workspaceController: runtime.controller,
    createGuidedLesson: runtime.createGuidedLesson,
    resetClassroom: runtime.resetClassroom,
  });
}

function createLessonInput(lessonId: string) {
  return {
    lessonId,
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
            guide: { body: string };
          }>;
        },
  };
}
