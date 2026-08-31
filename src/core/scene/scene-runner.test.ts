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
import { SceneRunner } from "./scene-runner";
import type { WaitCoordinator } from "./wait-coordinator";

describe("SceneRunner", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("starts immediately, presents structured guidance, and cleans up on completion", async () => {
    const { runner, lifecycle } = createHarness();
    const started = await runner.start(scene("scene.complete", 1));

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
    expect(runner.store.getSnapshot().status).toBe("playing");

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
    await vi.advanceTimersByTimeAsync(5);

    expect(runner.store.getSnapshot()).toEqual(
      expect.objectContaining({
        status: "waiting",
        activeBeatId: "beat.local-action",
      }),
    );
    expect(runner.presentation.getSnapshot().assistant.stateId).toBe(
      "assistant.thinking",
    );
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
  targetHandle?: ObservableTargetHandle;
  targetHandles?: ObservableTargetHandle[];
  targetRecoveryMs?: number;
  waits?: WaitCoordinator;
} = {}) {
  const platform = createP0ProviderPlatform();
  const lesson = new LessonStore(
    createActiveLessonState(
      {
        id: "lesson.scene",
        title: "Scene lesson",
        objective: "Exercise the scene engine.",
      },
      [
        {
          id: "step.1",
          title: "Step 1",
          objective: "Follow the guidance.",
          criteria: [],
          hints: ["Try the registered target."],
        },
      ],
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
    getViewport: () => ({ width: 1280, height: 800 }),
    prefersReducedMotion: () => true,
    beatDurationMs: options.beatDurationMs ?? 5,
    targetRecoveryMs: options.targetRecoveryMs,
  });
  return { runner, lifecycle, targetHandle, resolveTarget };
}

function scene(id: string, beatCount: number): TeachingScene {
  return {
    id,
    cleanupPolicy: "replace",
    allowManualNavigation: true,
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
