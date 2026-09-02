import { describe, expect, it, vi } from "vitest";

import { GuideBuildService } from "@/core/guide-build";
import type {
  EnvironmentActionResult,
  RuntimeSnapshot,
  WorkspaceEnvironmentConfiguration,
  WorkspaceFile,
  WorkspaceFileOperation,
} from "@/core/workspace/contracts";
import type { RuntimeAdapter } from "@/core/workspace/runtime-adapter";
import {
  InMemorySurfaceAdapter,
  SurfaceAdapterRegistry,
} from "@/core/workspace/surface-adapter";
import { WorkspaceStore } from "@/core/workspace/store";
import { WorkspaceController } from "@/core/workspace/workspace-controller";
import { createP0ProviderPlatform } from "@/providers/p0";

import { LessonActivityService } from "./activity";
import {
  ClassroomCleanupError,
  CreateGuidedLessonUseCase,
  ResetClassroomUseCase,
} from "./bootstrap";
import { ClassroomLifecycleService } from "./lifecycle";
import { createIdleLessonState } from "./state";
import { LessonStore } from "./store";
import { RecordAttemptUseCase, RevealHintUseCase } from "./use-cases";

describe("classroom bootstrap and reset", () => {
  it("replaces a lesson only after lifecycle cleanup and workspace configuration", async () => {
    const harness = createHarness();
    const disposalOrder: string[] = [];
    harness.lifecycle.register({
      id: "scene.previous",
      kind: "scene",
      dispose: () => {
        disposalOrder.push("scene");
      },
    });
    harness.lifecycle.register({
      id: "wait.previous",
      kind: "wait",
      dispose: () => {
        disposalOrder.push("wait");
      },
    });

    const snapshot = await harness.createLesson.execute(createCommand("lesson.first"));

    expect(disposalOrder).toEqual(["wait", "scene"]);
    expect(snapshot.lesson).toEqual(
      expect.objectContaining({
        status: "active",
        lesson: expect.objectContaining({ id: "lesson.first" }),
        progress: expect.objectContaining({ totalSteps: 3, percentage: 0 }),
      }),
    );
    expect(snapshot.workspace).toEqual(
      expect.objectContaining({
        status: "ready",
        profileId: "profile.vanilla-web",
        activeFilePath: "index.html",
      }),
    );
    expect(snapshot.lifecycle.total).toBe(0);
    expect(harness.guideBuild.store.getSnapshot()).toMatchObject({
      status: "completed",
      stage: "setting-up-classroom",
    });
  });

  it("rejects an invalid environment before cleaning or mutating the active class", async () => {
    const harness = createHarness();
    await harness.createLesson.execute(createCommand("lesson.previous"));
    const dispose = vi.fn();
    harness.lifecycle.register({ id: "scene.previous", kind: "scene", dispose });
    const previousLesson = harness.lessonStore.getSnapshot();
    const previousWorkspace = harness.workspaceStore.getSnapshot();
    const invalid = createCommand("lesson.invalid");
    invalid.environment.files = [
      {
        path: "invalid.py",
        languageId: "language.python",
        content: "print('invalid')",
        visible: true,
      },
    ];

    await expect(harness.createLesson.execute(invalid)).rejects.toThrow();

    expect(dispose).not.toHaveBeenCalled();
    expect(harness.lessonStore.getSnapshot()).toBe(previousLesson);
    expect(harness.workspaceStore.getSnapshot()).toBe(previousWorkspace);
    expect(harness.lifecycle.getSnapshot().resourceIds).toEqual(["scene.previous"]);
  });

  it("falls back to an idle lesson after an operational bootstrap failure", async () => {
    const harness = createHarness();
    await harness.createLesson.execute(createCommand("lesson.previous"));
    const previousWorkspace = harness.workspaceStore.getSnapshot();
    harness.lifecycle.register({
      id: "scene.previous",
      kind: "scene",
      dispose: vi.fn(),
    });
    vi.mocked(harness.runtime.replaceFiles).mockRejectedValueOnce(
      new Error("runtime fixture failed"),
    );
    const failedCommand = createCommand("lesson.failed");
    failedCommand.environment.files = failedCommand.environment.files.map((file) =>
      file.path === "script.js" ? { ...file, content: "console.log('changed');" } : file,
    );

    await expect(
      harness.createLesson.execute(failedCommand),
    ).rejects.toThrow("runtime fixture failed");

    expect(harness.lessonStore.getSnapshot().status).toBe("idle");
    expect(harness.lessonStore.getSnapshot().lesson).toBeUndefined();
    expect(harness.workspaceStore.getSnapshot()).toBe(previousWorkspace);
    expect(harness.lifecycle.getSnapshot().total).toBe(0);
    expect(harness.guideBuild.store.getSnapshot().status).toBe("error");
  });

  it("aborts before workspace mutation when lifecycle cleanup cannot finish", async () => {
    const harness = createHarness();
    await harness.createLesson.execute(createCommand("lesson.previous"));
    const previousLesson = harness.lessonStore.getSnapshot();
    const previousWorkspace = harness.workspaceStore.getSnapshot();
    harness.lifecycle.register({
      id: "scene.failed",
      kind: "scene",
      dispose: () => {
        throw new Error("scene cleanup failed");
      },
    });

    await expect(
      harness.createLesson.execute(createCommand("lesson.next")),
    ).rejects.toBeInstanceOf(ClassroomCleanupError);

    expect(harness.lessonStore.getSnapshot()).toBe(previousLesson);
    expect(harness.workspaceStore.getSnapshot()).toBe(previousWorkspace);
    expect(harness.lifecycle.getSnapshot().resourceIds).toEqual(["scene.failed"]);
    expect(harness.guideBuild.store.getSnapshot().status).toBe("error");
  });

  it("resets all classroom state and resources while optionally preserving activity", async () => {
    const harness = createHarness();
    await harness.createLesson.execute(createCommand("lesson.reset"));
    new RecordAttemptUseCase(harness.lessonStore).execute("step.1", {
      id: "attempt.1",
      outcome: "failed",
      occurredAt: "2026-08-30T00:00:00.000Z",
    });
    new RevealHintUseCase(harness.lessonStore).execute("step.1");
    new LessonActivityService(harness.lessonStore).recordActivity({
      id: "activity.1",
      typeId: "lesson.attempted",
      source: "learner",
      occurredAt: "2026-08-30T00:00:00.000Z",
      lessonStepId: "step.1",
    });
    ["scene", "visual-guide", "assistant-motion", "observer", "interaction", "wait", "timer", "overlay", "validation", "runtime"].forEach(
      (kind) =>
        harness.lifecycle.register({
          id: `${kind}.1`,
          kind: kind as Parameters<ClassroomLifecycleService["register"]>[0]["kind"],
          dispose: vi.fn(),
        }),
    );

    const snapshot = await harness.resetClassroom.execute({
      scope: "all",
      preserve: { activity: true },
    });

    expect(snapshot.lesson).toEqual(
      expect.objectContaining({
        status: "idle",
        plan: expect.objectContaining({ steps: [] }),
        progress: expect.objectContaining({ totalSteps: 0 }),
        activity: [expect.objectContaining({ id: "activity.1" })],
      }),
    );
    expect(snapshot.workspace).toEqual(
      expect.objectContaining({ status: "idle", files: [], surfaces: [] }),
    );
    expect(snapshot.lifecycle.total).toBe(0);

    const repeated = await harness.resetClassroom.execute({ scope: "all" });
    expect(repeated.lesson.status).toBe("idle");
    expect(repeated.workspace.status).toBe("idle");
  });

  it("clears guidance state without clearing the lesson or workspace", async () => {
    const harness = createHarness();
    await harness.createLesson.execute(createCommand("lesson.guidance"));
    const workspace = harness.workspaceStore.getSnapshot();
    harness.lessonStore.commit({
      ...harness.lessonStore.getSnapshot(),
      agent: {
        status: "waiting",
        assistantIntent: {
          stateId: "assistant.thinking",
          occurredAt: "2026-08-30T00:00:00.000Z",
        },
      },
      waits: [
        {
          id: "wait.1",
          condition: {
            kind: "interaction",
            eventTypeId: "interaction.preview-click",
          },
          status: "pending",
          startedAt: "2026-08-30T00:00:00.000Z",
        },
      ],
    });
    harness.lifecycle.register({ id: "wait.1", kind: "wait", dispose: vi.fn() });

    const snapshot = await harness.resetClassroom.execute({ scope: "guidance" });

    expect(snapshot.lesson.lesson?.id).toBe("lesson.guidance");
    expect(snapshot.lesson.waits).toEqual([]);
    expect(snapshot.lesson.agent).toEqual({ status: "idle" });
    expect(harness.workspaceStore.getSnapshot()).toBe(workspace);
  });
});

function createHarness() {
  const registries = createP0ProviderPlatform();
  const workspaceStore = new WorkspaceStore();
  const surfaceAdapters = new SurfaceAdapterRegistry();
  registries.surfaces.list().forEach(({ id }) =>
    surfaceAdapters.register(new InMemorySurfaceAdapter(id)),
  );
  const runtime = createRuntimeAdapter();
  const workspace = new WorkspaceController({
    store: workspaceStore,
    registries,
    surfaceAdapters,
    runtimeAdapters: { get: () => runtime },
  });
  const lessonStore = new LessonStore(createIdleLessonState());
  const lifecycle = new ClassroomLifecycleService();
  const guideBuild = new GuideBuildService();
  const dependencies = { guideBuild, lessonStore, workspace, lifecycle };
  return {
    createLesson: new CreateGuidedLessonUseCase(dependencies),
    resetClassroom: new ResetClassroomUseCase(dependencies),
    lessonStore,
    guideBuild,
    lifecycle,
    runtime,
    workspaceStore,
  };
}

function createCommand(lessonId: string) {
  return {
    lesson: {
      id: lessonId,
      title: "Provider-neutral lesson",
      objective: "Exercise transactional classroom bootstrap.",
    },
    steps: [1, 2, 3].map((number) => ({
      id: `step.${number}`,
      title: `Step ${number}`,
      objective: `Complete step ${number}.`,
      criteria: [
        {
          id: `criterion.${number}`,
          validatorId: "validator.fake",
        },
      ],
      hints: [`Hint ${number}`],
    })),
    environment: createEnvironment(),
  };
}

function createEnvironment(): WorkspaceEnvironmentConfiguration {
  const profile = createP0ProviderPlatform().environmentProfiles.require(
    "profile.vanilla-web",
  );
  return {
    profileId: profile.id,
    runtimeProviderId: profile.runtimeProviderId,
    languageIds: profile.defaultLanguageIds,
    files: profile.defaultFiles.map((file) => ({
      ...file,
      visible: file.visible ?? true,
    })),
    surfaces: profile.defaultSurfaces,
    activeFilePath: "index.html",
    activeSurfaceId: "editor",
  };
}

function createRuntimeAdapter(): RuntimeAdapter {
  let files: readonly WorkspaceFile[] = [];
  let revision = 0;
  let status: RuntimeSnapshot["status"] = "idle";
  return {
    providerId: "runtime.sandpack-vanilla",
    replaceFiles: vi.fn(async (nextFiles: readonly WorkspaceFile[]) => {
      files = nextFiles.map((file) => ({ ...file }));
      status = "ready";
      revision += 1;
    }),
    applyOperations: vi.fn(async (operations: readonly WorkspaceFileOperation[]) => {
      operations.forEach((operation) => {
        if (operation.type === "update") {
          files = files.map((file) =>
            file.path === operation.path
              ? { ...file, content: operation.content }
              : file,
          );
        }
      });
      revision += 1;
    }),
    executeAction: vi.fn(
      async (actionId): Promise<EnvironmentActionResult> => ({
        actionId,
        accepted: true,
        message: "Action accepted.",
      }),
    ),
    getSnapshot: vi.fn(
      (): RuntimeSnapshot => ({
        providerId: "runtime.sandpack-vanilla",
        status,
        revision,
        files,
      }),
    ),
    reset: vi.fn(async () => {
      status = "stopped";
      revision += 1;
    }),
    dispose: vi.fn(async () => undefined),
  };
}
