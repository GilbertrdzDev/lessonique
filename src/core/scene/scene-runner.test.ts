import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ClassroomLifecycleService,
  createActiveLessonState,
  LessonStore,
} from "@/core/lesson";
import {
  ObservableTargetHandle,
  type GuidanceTargetAdapter,
} from "@/core/workspace/targeting";
import { TargetResolverFacade } from "@/core/workspace/target-resolver-facade";
import { createP0ProviderPlatform } from "@/providers/p0";

import type { TeachingScene } from "./contracts";
import {
  SceneRunner,
  type SceneExerciseEvaluator,
  type SceneInteractionObserver,
} from "./scene-runner";
import type { WaitCoordinator } from "./wait-coordinator";

describe("SceneRunner", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("accepts a content-driven scene with 15 distinct beats", () => {
    const { runner } = createHarness();

    expect(runner.validate(scene("scene.long-form", 15)).beats).toHaveLength(15);
  });

  it("rejects a scene above the 15-beat guide limit", () => {
    const { runner } = createHarness();

    expect(() => runner.validate(scene("scene.too-long", 16))).toThrow(
      "Teaching scenes support at most 15 beats",
    );
  });

  it("rejects more final criteria than the numbered guide can represent", () => {
    const { runner } = createHarness({
      exerciseEvaluator: {
        evaluate: vi.fn(async () => ({
          passed: false,
          passedCriteria: 0,
          totalCriteria: 6,
        })),
      },
      finalStepCriteria: Array.from({ length: 6 }, (_, index) => ({
        id: `criterion.${index + 1}`,
        requirement: `Requirement ${index + 1}`,
        validatorId: "validator.no-console-errors",
      })),
    });

    expect(() =>
      runner.validate({
        ...scene("scene.too-many-requirements", 1),
        beats: [
          {
            id: "beat.exercise",
            type: "interaction",
            lessonStepId: "step.1",
            effects: [],
            guide: {
              body: "Complete the final exercise.",
              supportingItems: Array.from(
                { length: 5 },
                (_, index) => `Requirement ${index + 1}`,
              ),
            },
            wait: {
              kind: "interaction",
              eventTypeId: "interaction.editor-change",
            },
          },
        ],
      }),
    ).toThrow(/has 6 criteria.*supports at most 5 numbered requirements/u);
  });

  it("starts immediately, presents structured guidance, and cleans up on completion", async () => {
    const { runner, lifecycle } = createHarness();
    const started = await runner.start(scene("scene.complete", 1, false));

    expect(started.status).toBe("preparing");
    await vi.runAllTimersAsync();

    expect(runner.store.getSnapshot()).toEqual(
      expect.objectContaining({
        id: "scene.complete",
        status: "completed",
        assistant: expect.objectContaining({ visible: false }),
      }),
    );
    expect(lifecycle.getSnapshot().total).toBe(0);
  });

  it("supports pause, resume, cancellation, and scene replacement", async () => {
    const { runner, lifecycle } = createHarness({ beatDurationMs: 30_000 });
    await runner.start(scene("scene.first", 2));
    await vi.advanceTimersByTimeAsync(0);

    await runner.control("pause", "scene.first");
    expect(runner.store.getSnapshot().status).toBe("paused");
    await runner.control("resume", "scene.first");
    expect(runner.store.getSnapshot().status).toBe("waiting");

    await runner.start(scene("scene.second", 1));
    expect(runner.store.getSnapshot()).toEqual(
      expect.objectContaining({ id: "scene.second", status: "preparing" }),
    );
    await runner.control("cancel", "scene.second");
    expect(runner.store.getSnapshot().status).toBe("cancelled");
    expect(lifecycle.getSnapshot().total).toBe(0);
  });

  it("navigates next, previous, and restart only through scene control", async () => {
    const { runner } = createHarness({ beatDurationMs: 30_000 });
    await runner.start(scene("scene.navigation", 3));
    await vi.advanceTimersByTimeAsync(0);

    await runner.control("next");
    await vi.advanceTimersByTimeAsync(0);
    expect(runner.store.getSnapshot().activeBeatId).toBe("beat.2");

    await runner.control("previous");
    await vi.advanceTimersByTimeAsync(0);
    expect(runner.store.getSnapshot().activeBeatId).toBe("beat.1");

    await runner.control("next");
    await vi.advanceTimersByTimeAsync(0);
    await runner.control("restart");
    await vi.advanceTimersByTimeAsync(0);
    expect(runner.store.getSnapshot().activeBeatId).toBe("beat.1");
    await runner.control("cancel");
  });

  it("synchronizes mapped Learning Plan sections independently from guide beats", async () => {
    const { runner, lesson } = createHarness({
      beatDurationMs: 30_000,
      lessonStepCount: 3,
    });
    const mappedScene: TeachingScene = {
      ...scene("scene.sections", 4),
      beats: ["step.1", "step.1", "step.2", "step.3"].map(
        (lessonStepId, index) => ({
          id: `beat.${index + 1}`,
          lessonStepId,
          effects: [],
          guide: { body: `Guide ${index + 1}` },
        }),
      ),
    };

    await runner.start(mappedScene);
    await vi.advanceTimersByTimeAsync(0);
    expect(lesson.getSnapshot().plan.steps.map(({ status }) => status)).toEqual([
      "active",
      "pending",
      "pending",
    ]);

    await runner.control("next");
    await vi.advanceTimersByTimeAsync(0);
    expect(runner.presentation.getSnapshot().navigation.current).toBe(2);
    expect(lesson.getSnapshot().plan.activeStepId).toBe("step.1");

    await runner.control("next");
    await vi.advanceTimersByTimeAsync(0);
    expect(lesson.getSnapshot().plan.steps.map(({ status }) => status)).toEqual([
      "completed",
      "active",
      "pending",
    ]);

    await runner.control("previous");
    await vi.advanceTimersByTimeAsync(0);
    expect(lesson.getSnapshot().plan.steps.map(({ status }) => status)).toEqual([
      "active",
      "pending",
      "pending",
    ]);

    await runner.control("next");
    await vi.advanceTimersByTimeAsync(0);
    await runner.control("next");
    await vi.advanceTimersByTimeAsync(0);
    expect(lesson.getSnapshot().plan.steps.map(({ status }) => status)).toEqual([
      "completed",
      "completed",
      "active",
    ]);

    await runner.control("next");
    await vi.runAllTimersAsync();
    expect(lesson.getSnapshot()).toEqual(
      expect.objectContaining({
        status: "completed",
        progress: expect.objectContaining({ completedSteps: 3, percentage: 100 }),
      }),
    );
    expect(lesson.getSnapshot().plan.steps.every(({ status }) => status === "completed")).toBe(true);
  });

  it("validates a final exercise manually and after relevant editor changes before Finish", async () => {
    let passed = false;
    let interactionListener:
      | Parameters<SceneInteractionObserver["subscribe"]>[0]
      | undefined;
    const exerciseEvaluator: SceneExerciseEvaluator = {
      evaluate: vi.fn(async () => ({
        passed,
        passedCriteria: passed ? 2 : 1,
        totalCriteria: 2,
      })),
    };
    const interactions: SceneInteractionObserver = {
      subscribe: vi.fn((listener) => {
        interactionListener = listener;
        return () => {
          interactionListener = undefined;
        };
      }),
    };
    const { runner, lesson, targetHandle } = createHarness({
      beatDurationMs: 30_000,
      exerciseEvaluator,
      interactions,
      lessonStepCount: 2,
      finalStepCriteria: [
        {
          id: "criterion.function",
          requirement: "Create `describeFavorite`.",
          validatorId: "validator.javascript-function-exists",
          input: { filePath: "index.js", name: "describeFavorite" },
        },
        {
          id: "criterion.call",
          requirement: "Call `describeFavorite`.",
          validatorId: "validator.javascript-call-exists",
          input: { filePath: "index.js", calleeName: "describeFavorite" },
        },
      ],
    });
    const exerciseScene: TeachingScene = {
      ...scene("scene.exercise", 2),
      beats: [
        {
          id: "beat.explanation",
          lessonStepId: "step.1",
          effects: [],
          guide: { body: "Review the complete example." },
        },
        {
          id: "beat.exercise",
          type: "interaction",
          lessonStepId: "step.2",
          prepare: { surfaceId: "editor", filePath: "index.js" },
          target: {
            resolverId: "target.surface-anchor",
            input: { anchorId: "anchor.workspace-editor" },
          },
          effects: [],
          guide: {
            body: "Create and call describeFavorite.",
          },
          wait: {
            kind: "interaction",
            eventTypeId: "interaction.editor-change",
            target: {
              resolverId: "target.code-range",
              input: {
                filePath: "index.js",
                startLine: 10,
                startColumn: 1,
                endLine: 12,
                endColumn: 1,
              },
            },
          },
        },
      ],
    };

    const submittedScene = {
      ...exerciseScene,
      beats: [
        exerciseScene.beats[0]!,
        {
          ...exerciseScene.beats[1]!,
          guide: {
            body: "Create and call describeFavorite.",
            supportingItems: ["An independently generated item."],
          },
        },
      ],
    };
    const preparedScene = runner.validate(submittedScene);

    expect(preparedScene.beats.at(-1)?.guide?.supportingItems).toEqual([
      "Create `describeFavorite`.",
      "Call `describeFavorite`.",
    ]);
    expect(submittedScene.beats.at(-1)?.guide?.supportingItems).toEqual([
      "An independently generated item.",
    ]);
    expect(() =>
      runner.validate({
        ...exerciseScene,
        beats: [
          exerciseScene.beats[0]!,
          { ...exerciseScene.beats[1]!, guide: undefined },
        ],
      }),
    ).toThrow(/requires a visual guide/u);

    await runner.start(exerciseScene);
    await vi.advanceTimersByTimeAsync(0);
    await runner.control("next");
    await vi.advanceTimersByTimeAsync(0);

    expect(runner.presentation.getSnapshot().navigation).toMatchObject({
      current: 2,
      total: 2,
      nextBlocked: true,
      exerciseValidation: { status: "idle" },
    });
    const stableExercisePosition = runner.presentation.getSnapshot().assistant.position;
    targetHandle.update({
      status: "resolved",
      geometry: { left: 180, top: 220, width: 360, height: 180 },
    });
    await vi.advanceTimersByTimeAsync(20);
    expect(runner.presentation.getSnapshot().assistant.position).toEqual(
      stableExercisePosition,
    );
    await expect(runner.control("next")).rejects.toThrow(
      /Complete the required learner interaction/u,
    );

    await runner.validateCurrentExercise();
    expect(runner.presentation.getSnapshot().navigation).toMatchObject({
      nextBlocked: true,
      exerciseValidation: {
        status: "failed",
        message: "1 of 2 requirements passed.",
      },
    });
    expect(exerciseEvaluator.evaluate).toHaveBeenLastCalledWith(
      "step.2",
      { recordAttempt: true },
      expect.any(AbortSignal),
    );

    passed = true;
    const presentationListener = vi.fn();
    const unsubscribePresentation = runner.presentation.subscribe(presentationListener);
    for (let index = 1; index <= 3; index += 1) {
      interactionListener?.({
        id: `editor-change-${index}`,
        typeId: "interaction.editor-change",
        surfaceId: "editor",
        environmentRevision: 1,
        occurredAt: `2026-09-02T00:00:0${index}.000Z`,
      });
    }
    expect(runner.presentation.getSnapshot().navigation).toMatchObject({
      nextBlocked: true,
      exerciseValidation: { status: "validating" },
    });
    expect(interactions.subscribe).toHaveBeenCalledTimes(1);
    expect(presentationListener).toHaveBeenCalledTimes(1);
    expect(exerciseEvaluator.evaluate).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(349);
    expect(exerciseEvaluator.evaluate).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(runner.presentation.getSnapshot().navigation).toMatchObject({
      nextBlocked: false,
      exerciseValidation: { status: "passed" },
    });
    unsubscribePresentation();

    interactionListener?.({
      id: "editor-change-4",
      typeId: "interaction.editor-change",
      surfaceId: "editor",
      environmentRevision: 1,
      occurredAt: "2026-09-02T00:00:04.000Z",
    });
    await vi.advanceTimersByTimeAsync(350);
    expect(runner.presentation.getSnapshot().navigation.nextBlocked).toBe(false);

    passed = false;
    interactionListener?.({
      id: "editor-change-5",
      typeId: "interaction.editor-change",
      surfaceId: "editor",
      environmentRevision: 1,
      occurredAt: "2026-09-02T00:00:05.000Z",
    });
    expect(runner.presentation.getSnapshot().navigation.nextBlocked).toBe(true);
    await vi.advanceTimersByTimeAsync(350);
    expect(runner.presentation.getSnapshot().navigation).toMatchObject({
      nextBlocked: true,
      exerciseValidation: { status: "failed" },
    });

    passed = true;
    await runner.validateCurrentExercise();
    await runner.control("next");
    await vi.runAllTimersAsync();

    expect(runner.store.getSnapshot().status).toBe("completed");
    expect(lesson.getSnapshot()).toMatchObject({
      status: "completed",
      progress: { completedSteps: 2, totalSteps: 2, percentage: 100 },
    });
    expect(lesson.getSnapshot().plan.steps.at(-1)?.status).toBe("completed");
  });

  it("validates an intermediate coding exercise in its own beat and synchronizes the plan", async () => {
    let passed = false;
    let interactionListener:
      | Parameters<SceneInteractionObserver["subscribe"]>[0]
      | undefined;
    const exerciseEvaluator: SceneExerciseEvaluator = {
      evaluate: vi.fn(async () => ({
        passed,
        passedCriteria: passed ? 1 : 0,
        totalCriteria: 1,
        ...(passed
          ? {}
          : { failedRequirements: ["Use an `h1` heading."] }),
      })),
    };
    const interactions: SceneInteractionObserver = {
      subscribe: vi.fn((listener) => {
        interactionListener = listener;
        return vi.fn();
      }),
    };
    const { runner, lesson } = createHarness({
      beatDurationMs: 30_000,
      exerciseEvaluator,
      interactions,
      lessonStepCount: 3,
      stepCriteria: {
        2: [
          {
            id: "criterion.heading",
            requirement: "Use an `h1` heading.",
            validatorId: "validator.html-element-exists",
            input: { filePath: "index.html", tagName: "h1" },
          },
        ],
      },
    });
    const intermediateScene: TeachingScene = {
      ...scene("scene.intermediate-exercise", 3),
      beats: [
        {
          id: "beat.intro",
          lessonStepId: "step.1",
          type: "explanation",
          effects: [],
          guide: { body: "Review the current markup." },
        },
        {
          id: "beat.exercise",
          lessonStepId: "step.2",
          type: "interaction",
          prepare: { surfaceId: "editor", filePath: "index.html" },
          effects: [],
          guide: { body: "Replace the heading element." },
          wait: {
            kind: "interaction",
            eventTypeId: "interaction.editor-change",
          },
        },
        {
          id: "beat.review",
          lessonStepId: "step.3",
          type: "explanation",
          effects: [],
          guide: { body: "Review the completed structure." },
        },
      ],
    };

    await runner.start(intermediateScene);
    await vi.advanceTimersByTimeAsync(0);
    await runner.control("next");
    await vi.advanceTimersByTimeAsync(0);

    expect(runner.presentation.getSnapshot().navigation).toMatchObject({
      current: 2,
      total: 3,
      nextBlocked: true,
      exerciseValidation: { status: "idle" },
    });
    await runner.validateCurrentExercise();
    expect(runner.presentation.getSnapshot().navigation).toMatchObject({
      nextBlocked: true,
      exerciseValidation: {
        status: "failed",
        message:
          "0 of 1 requirements passed. Still needed: Use an `h1` heading.",
      },
    });
    expect(exerciseEvaluator.evaluate).toHaveBeenLastCalledWith(
      "step.2",
      { recordAttempt: true },
      expect.any(AbortSignal),
    );

    passed = true;
    await runner.validateCurrentExercise();
    expect(runner.presentation.getSnapshot().navigation).toMatchObject({
      nextBlocked: false,
      exerciseValidation: {
        status: "passed",
        message: "Exercise complete. Next is now available.",
      },
    });
    expect(lesson.getSnapshot().plan.steps.map(({ status }) => status)).toEqual([
      "completed",
      "completed",
      "active",
    ]);

    await runner.control("next");
    await vi.advanceTimersByTimeAsync(0);
    expect(runner.presentation.getSnapshot().navigation).toMatchObject({
      current: 3,
      nextBlocked: false,
    });
    expect(runner.presentation.getSnapshot().navigation.exerciseValidation).toBeUndefined();

    await runner.control("previous");
    await vi.advanceTimersByTimeAsync(0);
    passed = false;
    interactionListener?.({
      id: "editor-change-intermediate",
      typeId: "interaction.editor-change",
      surfaceId: "editor",
      environmentRevision: 1,
      occurredAt: "2026-09-03T00:00:00.000Z",
    });
    expect(runner.presentation.getSnapshot().navigation).toMatchObject({
      current: 2,
      nextBlocked: true,
      exerciseValidation: { status: "validating" },
    });
    expect(lesson.getSnapshot().plan.steps.map(({ status }) => status)).toEqual([
      "completed",
      "active",
      "pending",
    ]);
    await vi.advanceTimersByTimeAsync(350);
    expect(runner.presentation.getSnapshot().navigation.exerciseValidation).toMatchObject({
      status: "failed",
      message: "0 of 1 requirements passed. Still needed: Use an `h1` heading.",
    });
  });

  it("replays the last completed scene from beat one only for the same lesson", async () => {
    const { runner, lesson } = createHarness({
      beatDurationMs: 30_000,
      lessonStepCount: 2,
    });
    const replayableScene: TeachingScene = {
      ...scene("scene.replayable", 2),
      beats: ["step.1", "step.2"].map((lessonStepId, index) => ({
        id: `beat.${index + 1}`,
        lessonStepId,
        effects: [],
        guide: { body: `Guide ${index + 1}` },
      })),
    };

    expect(runner.canReplayLast()).toBe(false);
    await runner.start(replayableScene);
    await vi.advanceTimersByTimeAsync(0);
    await runner.control("next");
    await vi.advanceTimersByTimeAsync(0);
    await runner.control("next");
    await vi.runAllTimersAsync();

    expect(lesson.getSnapshot().status).toBe("completed");
    expect(runner.canReplayLast()).toBe(true);

    await runner.replayLast();
    await vi.advanceTimersByTimeAsync(0);

    expect(runner.store.getSnapshot()).toEqual(
      expect.objectContaining({
        id: "scene.replayable",
        activeBeatId: "beat.1",
        status: "waiting",
      }),
    );
    expect(lesson.getSnapshot().plan.steps.map(({ status }) => status)).toEqual([
      "active",
      "pending",
    ]);
    expect(runner.canReplayLast()).toBe(false);

    await runner.control("cancel");
    const replacement = createActiveLessonState(
      {
        id: "lesson.replacement",
        title: "Replacement lesson",
        objective: "Invalidate the previous replay.",
      },
      [
        {
          id: "step.replacement",
          title: "Replacement step",
          objective: "Use the replacement lesson.",
          criteria: [],
          hints: [],
        },
      ],
    );
    lesson.commit({ ...replacement, revision: lesson.getSnapshot().revision + 1 });

    expect(runner.canReplayLast()).toBe(false);
    await expect(runner.replayLast()).rejects.toThrow(/no completed teaching scene/u);
  });

  it("tracks a semantic target and updates collision-safe presentation geometry", async () => {
    const targetHandle = new ObservableTargetHandle({
      status: "resolved",
      geometry: { left: 40, top: 80, width: 120, height: 40 },
    });
    const { runner } = createHarness({ targetHandle, beatDurationMs: 30_000 });
    await runner.start(targetScene());
    await vi.advanceTimersByTimeAsync(0);

    expect(runner.presentation.getSnapshot()).toEqual(
      expect.objectContaining({
        guide: {
          title: "Target guidance",
          body: "Focus on the registered target.",
          supportingItems: ["First item", "Second item"],
        },
        caption: "Target caption",
        targetSnapshot: expect.objectContaining({ status: "resolved" }),
        effects: [{ effectId: "effect.focus" }, { effectId: "effect.point" }],
      }),
    );

    targetHandle.update({
      status: "resolved",
      geometry: { left: 420, top: 180, width: 160, height: 44 },
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(
      runner.presentation.getSnapshot().targetSnapshot,
    ).toEqual(
      expect.objectContaining({
        geometry: expect.objectContaining({ left: 420 }),
      }),
    );
    await runner.control("cancel");
  });

  it("suspends target-dependent presentation when a target leaves view and restores it on recovery", async () => {
    const targetHandle = new ObservableTargetHandle({
      status: "resolved",
      geometry: { left: 40, top: 80, width: 120, height: 40 },
    });
    const { runner } = createHarness({ targetHandle, beatDurationMs: 30_000 });
    await runner.start(targetScene());
    await vi.advanceTimersByTimeAsync(0);

    targetHandle.update({ status: "lost" });
    await vi.advanceTimersByTimeAsync(0);
    expect(runner.presentation.getSnapshot().visibility).toBe("out-of-view");
    targetHandle.update({
      status: "resolved",
      geometry: { left: 80, top: 120, width: 90, height: 24 },
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(runner.presentation.getSnapshot().visibility).toBe("visible");
    expect(runner.presentation.getSnapshot().targetSnapshot).toEqual({
      status: "resolved",
      geometry: { left: 80, top: 120, width: 90, height: 24 },
    });
    await runner.control("cancel");
  });

  it("coalesces rapid navigation onto the latest requested beat and rejects stale geometry", async () => {
    const targetHandles = [
      new ObservableTargetHandle({
        status: "resolved",
        geometry: { left: 40, top: 80, width: 120, height: 40 },
      }),
      new ObservableTargetHandle({
        status: "resolved",
        geometry: { left: 240, top: 180, width: 120, height: 40 },
      }),
      new ObservableTargetHandle({
        status: "resolved",
        geometry: { left: 440, top: 280, width: 120, height: 40 },
      }),
    ];
    const { runner } = createHarness({ targetHandles, beatDurationMs: 30_000 });
    const baseBeat = targetScene().beats[0]!;
    const rapidScene: TeachingScene = {
      ...targetScene(),
      id: "scene.rapid",
      beats: [1, 2, 3].map((number) => ({
        ...baseBeat,
        id: `beat.${number}`,
      })),
    };
    await runner.start(rapidScene);
    await vi.advanceTimersByTimeAsync(0);

    await runner.control("next");
    await runner.control("next");
    await vi.advanceTimersByTimeAsync(0);

    expect(runner.store.getSnapshot().activeBeatId).toBe("beat.3");
    expect(runner.presentation.getSnapshot().beatId).toBe("beat.3");
    expect(runner.presentation.getSnapshot().targetSnapshot).toEqual({
      status: "resolved",
      geometry: expect.objectContaining({ left: 240 }),
    });
    targetHandles[0]!.update({
      status: "resolved",
      geometry: { left: 999, top: 999, width: 1, height: 1 },
    });
    expect(runner.presentation.getSnapshot().targetSnapshot).toEqual({
      status: "resolved",
      geometry: expect.not.objectContaining({ left: 999 }),
    });
    await runner.control("cancel");
  });

  it("runs a complete companion-assisted fixture and reacts to a local learner wait", async () => {
    let resolveWait!: (result: Awaited<ReturnType<WaitCoordinator["waitFor"]>>) => void;
    const waits = {
      waitFor: vi.fn(
        () =>
          new Promise<Awaited<ReturnType<WaitCoordinator["waitFor"]>>>((resolve) => {
            resolveWait = resolve;
          }),
      ),
    } as unknown as WaitCoordinator;
    const { runner } = createHarness({
      waits,
      targetHandles: [
        new ObservableTargetHandle({
          status: "resolved",
          geometry: { left: 40, top: 80, width: 120, height: 40 },
        }),
        new ObservableTargetHandle({
          status: "resolved",
          geometry: { left: 520, top: 260, width: 180, height: 48 },
        }),
      ],
    });
    const fixture: TeachingScene = {
      ...targetScene(),
      beats: [
        targetScene().beats[0]!,
        {
          ...targetScene().beats[0]!,
          id: "beat.local-action",
          type: "interaction",
          assistant: {
            stateId: "assistant.pointing",
            placementId: "placement.near-target",
            visible: true,
          },
          wait: {
            kind: "interaction",
            eventTypeId: "interaction.surface-activate",
            lessonStepId: "step.1",
            target: {
              resolverId: "target.surface-anchor",
              input: { anchorId: "anchor.learning-plan" },
            },
            timeoutMs: 1_000,
          },
        },
      ],
    };

    await runner.start(fixture);
    await vi.advanceTimersByTimeAsync(0);
    await runner.control("next");
    await vi.advanceTimersByTimeAsync(0);

    expect(runner.store.getSnapshot()).toEqual(
      expect.objectContaining({
        status: "waiting",
        activeBeatId: "beat.local-action",
      }),
    );
    expect(runner.presentation.getSnapshot().assistant.stateId).toBe("assistant.waiting");
    expect(runner.presentation.getSnapshot().phase).toBe("interaction");
    expect(runner.presentation.getSnapshot().effects).toEqual([]);
    await expect(runner.control("next")).rejects.toThrow(/required learner interaction/u);
    expect(runner.presentation.getSnapshot().targetSnapshot).toEqual(
      expect.objectContaining({
        geometry: expect.objectContaining({ left: 520, top: 260 }),
      }),
    );
    resolveWait({
      status: "satisfied",
      outcome: "success",
      eventId: "interaction.fixture.success",
    });
    await Promise.resolve();

    expect(runner.presentation.getSnapshot().assistant.stateId).toBe(
      "assistant.success",
    );
    await vi.advanceTimersByTimeAsync(649);
    expect(runner.presentation.getSnapshot().assistant.stateId).toBe(
      "assistant.success",
    );
    await vi.runAllTimersAsync();
    expect(runner.store.getSnapshot().status).toBe("completed");
  });

  it("rejects unsupported target effects without changing scene state", async () => {
    const { runner } = createHarness();
    const base = targetScene();
    const invalid: TeachingScene = {
      ...base,
      beats: [
        {
          ...base.beats[0]!,
          effects: [{ effectId: "effect.unregistered" }],
        },
      ],
    };

    await expect(runner.start(invalid)).rejects.toThrow(/does not contain/u);
    expect(runner.store.getSnapshot().status).toBe("idle");
  });

  it("rejects voice and audio scene fields before creating resources", async () => {
    const { runner, lifecycle } = createHarness();
    const invalid = {
      ...scene("scene.voice", 1),
      narration: "Read the guide aloud.",
    } as TeachingScene;

    await expect(runner.start(invalid)).rejects.toThrow(
      /do not support "narration"/u,
    );
    expect(runner.store.getSnapshot().status).toBe("idle");
    expect(lifecycle.getSnapshot().total).toBe(0);
  });

  it("retries a lost semantic target with bounded cleanup", async () => {
    const lost = new ObservableTargetHandle({ status: "lost" });
    const recovered = new ObservableTargetHandle({
      status: "resolved",
      geometry: { left: 200, top: 100, width: 80, height: 32 },
    });
    const { runner, resolveTarget } = createHarness({
      targetHandles: [lost, recovered],
      targetRecoveryMs: 10,
    });
    const sceneWithRetry: TeachingScene = {
      ...targetScene(),
      beats: [
        {
          ...targetScene().beats[0]!,
          targetLossRecovery: "retry",
        },
      ],
    };

    await runner.start(sceneWithRetry);
    await vi.advanceTimersByTimeAsync(11);

    expect(resolveTarget).toHaveBeenCalledTimes(2);
    expect(runner.presentation.getSnapshot().targetSnapshot).toEqual(
      expect.objectContaining({
        status: "resolved",
        geometry: expect.objectContaining({ left: 200 }),
      }),
    );
    await runner.control("cancel");
  });

  it("cleans the active scene when the classroom lifecycle is reset", async () => {
    const { runner, lifecycle } = createHarness({ beatDurationMs: 30_000 });
    await runner.start(scene("scene.reset", 1));
    await vi.advanceTimersByTimeAsync(0);

    const cleanup = await lifecycle.cleanup("guidance", "reset");
    await vi.advanceTimersByTimeAsync(0);

    expect(cleanup.failures).toEqual([]);
    expect(lifecycle.getSnapshot().total).toBe(0);
    expect(runner.store.getSnapshot().status).toBe("cancelled");
    expect(runner.presentation.getSnapshot().effects).toEqual([]);
  });

  it("turns unrecoverable target loss into a failed scene with no stale overlay", async () => {
    const lost = new ObservableTargetHandle({ status: "lost" });
    const { runner, lifecycle } = createHarness({
      targetHandles: [lost],
      targetRecoveryMs: 10,
    });
    const base = targetScene();
    const cancelOnLoss: TeachingScene = {
      ...base,
      beats: [{ ...base.beats[0]!, targetLossRecovery: "cancel" }],
    };

    await runner.start(cancelOnLoss);
    await vi.advanceTimersByTimeAsync(11);

    expect(runner.store.getSnapshot().status).toBe("failed");
    expect(runner.store.getSnapshot().error).toEqual({
      code: "scene_target_unavailable",
      message: 'Semantic target "target.surface-anchor" could not be resolved.',
      recoverable: true,
    });
    expect(runner.presentation.getSnapshot().effects).toEqual([]);
    expect(lifecycle.getSnapshot().total).toBe(0);
    await expect(runner.control("pause")).rejects.toThrow(/no active/u);
  });
});

function createHarness(options: {
  beatDurationMs?: number;
  lessonStepCount?: number;
  targetHandle?: ObservableTargetHandle;
  targetHandles?: ObservableTargetHandle[];
  targetRecoveryMs?: number;
  waits?: WaitCoordinator;
  exerciseEvaluator?: SceneExerciseEvaluator;
  interactions?: SceneInteractionObserver;
  finalStepCriteria?: Parameters<typeof createActiveLessonState>[1][number]["criteria"];
  stepCriteria?: Record<
    number,
    Parameters<typeof createActiveLessonState>[1][number]["criteria"]
  >;
} = {}) {
  const platform = createP0ProviderPlatform();
  const lessonStepCount = options.lessonStepCount ?? 1;
  const lesson = new LessonStore(
    createActiveLessonState(
      {
        id: "lesson.scene",
        title: "Scene lesson",
        objective: "Exercise the scene engine.",
      },
      Array.from({ length: lessonStepCount }, (_, index) => ({
        id: `step.${index + 1}`,
        title: `Step ${index + 1}`,
        objective: "Follow the guidance.",
        criteria:
          options.stepCriteria?.[index + 1] ??
          (index === lessonStepCount - 1 ? options.finalStepCriteria ?? [] : []),
        hints: ["Try the registered target."],
      })),
    ),
  );
  const lifecycle = new ClassroomLifecycleService();
  const targetHandle = options.targetHandle ?? new ObservableTargetHandle({
    status: "resolved",
    geometry: { left: 40, top: 80, width: 120, height: 40 },
  });
  const targetHandles = options.targetHandles ?? [targetHandle];
  let targetIndex = 0;
  const resolveTarget = vi.fn(async () =>
    targetHandles[Math.min(targetIndex++, targetHandles.length - 1)]!,
  );
  const adapter: GuidanceTargetAdapter = {
    supportsTargetResolver: (resolverId) => resolverId === "target.surface-anchor",
    prepareTarget: vi.fn(async () => undefined),
    resolveTarget,
  };
  const runner = new SceneRunner({
    platform,
    lesson,
    lifecycle,
    targets: new TargetResolverFacade(platform.targetResolvers, [adapter]),
    surfacePreparer: { prepare: vi.fn(async () => undefined) },
    waits: options.waits ?? ({ waitFor: vi.fn() } as unknown as WaitCoordinator),
    exerciseEvaluator: options.exerciseEvaluator,
    exerciseInteractionTypeIds: ["interaction.editor-change"],
    interactions: options.interactions,
    getViewport: () => ({ width: 1280, height: 800 }),
    prefersReducedMotion: () => true,
    beatDurationMs: options.beatDurationMs ?? 5,
    targetRecoveryMs: options.targetRecoveryMs,
  });
  return { runner, lesson, lifecycle, targetHandle, resolveTarget };
}

function scene(id: string, beatCount: number, allowManualNavigation = true): TeachingScene {
  return {
    id,
    cleanupPolicy: "replace",
    allowManualNavigation,
    beats: Array.from({ length: beatCount }, (_, index) => ({
      id: `beat.${index + 1}`,
      effects: [],
      guide: { body: `Guide ${index + 1}` },
      caption: `Caption ${index + 1}`,
    })),
  };
}

function targetScene(): TeachingScene {
  return {
    id: "scene.target",
    cleanupPolicy: "replace",
    allowManualNavigation: true,
    beats: [
      {
        id: "beat.target",
        target: {
          resolverId: "target.surface-anchor",
          input: { anchorId: "anchor.workspace-editor" },
        },
        targetLossRecovery: "wait",
        assistant: {
          stateId: "assistant.pointing",
          placementId: "placement.near-target",
          visible: true,
        },
        effects: [{ effectId: "effect.focus" }, { effectId: "effect.point" }],
        guide: {
          title: "Target guidance",
          body: "Focus on the registered target.",
          supportingItems: ["First item", "Second item"],
        },
        caption: "Target caption",
      },
    ],
  };
}
