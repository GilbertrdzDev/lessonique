import { describe, expect, it, vi } from "vitest";

import { createP0WorkspaceRuntime } from "@/providers/p0";

import type { TeachingSceneInput } from "./contracts";
import { createEarlyWebMCPToolRegistry } from "./mock-handlers";
import { toTeachingScene } from "./teaching-scene-tools";

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

  it("creates two distinct JavaScript guides with content-driven scene lengths", async () => {
    const runtime = createP0WorkspaceRuntime();
    const registry = createRegistry(runtime);
    const functionsGuide = createJavaScriptGuideInput({
      lessonId: "lesson.javascript-functions",
      topic: "functions",
      beatCount: 5,
      withExercise: true,
    });

    const first = await registry.invoke("create_guided_lesson", functionsGuide);
    const preparedExercise = runtime.scene.runner.validate(
      toTeachingScene(functionsGuide.initialScene),
    );

    expect(first).toEqual(
      expect.objectContaining({
        ok: true,
        status: "completed",
        data: expect.objectContaining({
          lesson: expect.objectContaining({ id: "lesson.javascript-functions" }),
          scene: expect.objectContaining({ beatCount: 5 }),
        }),
      }),
    );
    expect(preparedExercise.beats.at(-1)?.guide?.supportingItems).toEqual([
      "Define the `practiceFunction` function.",
      "Run the function without console errors.",
    ]);

    const arraysGuide = createJavaScriptGuideInput({
      lessonId: "lesson.javascript-arrays",
      topic: "arrays",
      beatCount: 15,
      withExercise: false,
    });
    const second = await registry.invoke("create_guided_lesson", arraysGuide);

    expect(second).toEqual(
      expect.objectContaining({
        ok: true,
        status: "completed",
        data: expect.objectContaining({
          lesson: expect.objectContaining({ id: "lesson.javascript-arrays" }),
          scene: expect.objectContaining({ beatCount: 15 }),
        }),
      }),
    );
    expect(runtime.scene.store.getSnapshot()).toEqual(
      expect.objectContaining({ id: "scene.javascript-arrays", beatCount: 15 }),
    );
    await runtime.scene.runner.control("cancel", "scene.javascript-arrays");
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

  it("derives final exercise requirements from criteria instead of parallel guide items", async () => {
    const runtime = createP0WorkspaceRuntime();
    const registry = createRegistry(runtime);
    await registry.invoke(
      "create_guided_lesson",
      createLessonInput("lesson.previous"),
    );
    const previousLesson = runtime.lessonStore.getSnapshot();
    const previousWorkspace = runtime.store.getSnapshot();
    const replacement = {
      ...createLessonInput("lesson.misaligned-exercise"),
      steps: [
        {
          id: "step.exercise",
          title: "Build a semantic section",
          objective: "Create a section without runtime errors.",
          criteria: [
            {
              id: "criterion.section",
              requirement: "Add a `section` element.",
              validatorId: "validator.html-element-exists",
              input: { filePath: "index.html", tagName: "section" },
            },
            {
              id: "criterion.no-errors",
              requirement: "Run the page without console errors.",
              validatorId: "validator.no-console-errors",
            },
          ],
        },
      ],
      initialScene: {
        id: "scene.misaligned-exercise",
        allowManualNavigation: true,
        beats: [
          {
            id: "beat.exercise",
            type: "interaction" as const,
            lessonStepId: "step.exercise",
            prepare: { surfaceId: "editor", filePath: "index.html" },
            guide: {
              body: "Create a semantic section.",
              supportingItems: ["Add a `section` element."],
            },
            wait: {
              kind: "interaction" as const,
              eventTypeId: "interaction.editor-change",
              timeoutMs: 300_000,
            },
          },
        ],
      },
    };

    const result = await registry.invoke("create_guided_lesson", replacement);

    expect(result).toEqual(expect.objectContaining({ ok: true, status: "completed" }));
    expect(runtime.lessonStore.getSnapshot()).not.toBe(previousLesson);
    expect(runtime.store.getSnapshot()).not.toBe(previousWorkspace);
    const prepared = runtime.scene.runner.validate(
      toTeachingScene(replacement.initialScene),
    );
    expect(prepared.beats.at(-1)?.guide?.supportingItems).toEqual([
      "Add a `section` element.",
      "Run the page without console errors.",
    ]);
    await runtime.scene.runner.control("cancel", "scene.misaligned-exercise");
  });

  it("returns the exact schema path when a generated criterion omits its requirement", async () => {
    const runtime = createP0WorkspaceRuntime();
    const registry = createRegistry(runtime);
    const invalid = {
      ...createLessonInput("lesson.missing-requirement"),
      steps: [
        {
          id: "step.exercise",
          title: "Exercise",
          objective: "Validate the generated draft.",
          criteria: [
            {
              id: "criterion.missing-requirement",
              validatorId: "validator.no-console-errors",
              input: {},
            },
          ],
        },
      ],
    };

    const result = await registry.invoke("create_guided_lesson", invalid);

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: "invalid_input",
          message: expect.stringContaining("steps[0].criteria[0].requirement"),
          recoverable: true,
        }),
      }),
    );
    expect(runtime.lessonStore.getSnapshot().status).toBe("idle");
    expect(runtime.store.getSnapshot().status).toBe("idle");
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

function createJavaScriptGuideInput(options: {
  lessonId: string;
  topic: string;
  beatCount: number;
  withExercise: boolean;
}) {
  const explanationCount = options.withExercise
    ? options.beatCount - 1
    : options.beatCount;
  const explanationStepId = `step.${options.topic}`;
  const exerciseStepId = `step.${options.topic}-exercise`;
  const beats: Array<TeachingSceneInput["beats"][number]> = Array.from(
    { length: explanationCount },
    (_, index) => ({
      id: `beat.${options.topic}-${index + 1}`,
      lessonStepId: explanationStepId,
      type: "explanation" as const,
      guide: {
        body: `Explain ${options.topic} concept ${index + 1} as one focused idea.`,
      },
    }),
  );
  if (options.withExercise) {
    beats.push({
      id: `beat.${options.topic}-exercise`,
      lessonStepId: exerciseStepId,
      type: "interaction",
      guide: { body: "Complete the focused JavaScript exercise." },
      wait: {
        kind: "interaction" as const,
        eventTypeId: "interaction.editor-change",
      },
    });
  }
  return {
    lessonId: options.lessonId,
    lessonMode: options.withExercise ? ("mixed" as const) : ("explain" as const),
    title: `JavaScript ${options.topic}`,
    objective: `Learn JavaScript ${options.topic} progressively.`,
    environment: {
      profileId: "profile.javascript-console",
      runtimeProviderId: "runtime.sandpack-vanilla",
      languageIds: ["language.javascript"],
      activeFile: "script.js",
      activeSurfaceId: "editor",
    },
    files: [
      {
        path: "script.js",
        languageId: "language.javascript",
        content: options.withExercise
          ? "function practiceFunction() { return true; }\npracticeFunction();"
          : "const values = [1, 2, 3];\nconst doubled = values.map((value) => value * 2);\nconsole.log(doubled);",
      },
    ],
    steps: [
      {
        id: explanationStepId,
        title: `Understand ${options.topic}`,
        objective: `Explain JavaScript ${options.topic} clearly.`,
      },
      ...(options.withExercise
        ? [
            {
              id: exerciseStepId,
              title: "Apply the concept",
              objective: "Keep the practice function valid and error-free.",
              criteria: [
                {
                  id: "criterion.practice-function",
                  requirement: "Define the `practiceFunction` function.",
                  validatorId: "validator.javascript-function-exists",
                  input: { filePath: "script.js", name: "practiceFunction" },
                },
                {
                  id: "criterion.no-console-errors",
                  requirement: "Run the function without console errors.",
                  validatorId: "validator.no-console-errors",
                  input: {},
                },
              ],
            },
          ]
        : []),
    ],
    initialScene: {
      id: `scene.javascript-${options.topic}`,
      cleanupPolicy: "replace" as const,
      allowManualNavigation: true,
      beats,
    },
  };
}
