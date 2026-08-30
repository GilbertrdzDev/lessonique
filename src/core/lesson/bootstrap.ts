import type {
  WorkspaceEnvironmentConfiguration,
  WorkspaceState,
} from "@/core/workspace/contracts";
import type { WorkspaceController } from "@/core/workspace/workspace-controller";

import type {
  LessonDefinition,
  LessonState,
  LessonStepDefinition,
  LessonStoreAdapter,
} from "./contracts";
import {
  ClassroomLifecycleService,
  type ClassroomCleanupResult,
  type ClassroomCleanupScope,
  type ClassroomLifecycleSnapshot,
} from "./lifecycle";
import {
  createActiveLessonState,
  createIdleLessonState,
} from "./state";

export interface CreateGuidedLessonCommand {
  lesson: LessonDefinition;
  steps: readonly LessonStepDefinition[];
  environment: WorkspaceEnvironmentConfiguration;
}

export interface ResetClassroomCommand {
  scope: ClassroomCleanupScope;
  preserve?: {
    activity?: boolean;
  };
}

export interface ClassroomSnapshot {
  lesson: LessonState;
  workspace: WorkspaceState;
  lifecycle: ClassroomLifecycleSnapshot;
}

export class ClassroomCleanupError extends Error {
  readonly result: ClassroomCleanupResult;

  constructor(result: ClassroomCleanupResult) {
    super(
      `Classroom cleanup retained ${result.failures.length} resource${result.failures.length === 1 ? "" : "s"}.`,
    );
    this.name = "ClassroomCleanupError";
    this.result = result;
  }
}

export class GetClassroomSnapshotUseCase {
  readonly #lessonStore: LessonStoreAdapter;
  readonly #workspace: WorkspaceController;
  readonly #lifecycle: ClassroomLifecycleService;

  constructor(dependencies: {
    lessonStore: LessonStoreAdapter;
    workspace: WorkspaceController;
    lifecycle: ClassroomLifecycleService;
  }) {
    this.#lessonStore = dependencies.lessonStore;
    this.#workspace = dependencies.workspace;
    this.#lifecycle = dependencies.lifecycle;
  }

  execute(): ClassroomSnapshot {
    return {
      lesson: structuredClone(this.#lessonStore.getSnapshot()),
      workspace: structuredClone(this.#workspace.store.getSnapshot()),
      lifecycle: this.#lifecycle.getSnapshot(),
    };
  }
}

export class CreateGuidedLessonUseCase {
  readonly #lessonStore: LessonStoreAdapter;
  readonly #workspace: WorkspaceController;
  readonly #lifecycle: ClassroomLifecycleService;
  readonly #snapshot: GetClassroomSnapshotUseCase;

  constructor(dependencies: {
    lessonStore: LessonStoreAdapter;
    workspace: WorkspaceController;
    lifecycle: ClassroomLifecycleService;
  }) {
    this.#lessonStore = dependencies.lessonStore;
    this.#workspace = dependencies.workspace;
    this.#lifecycle = dependencies.lifecycle;
    this.#snapshot = new GetClassroomSnapshotUseCase(dependencies);
  }

  async execute(command: CreateGuidedLessonCommand): Promise<ClassroomSnapshot> {
    const currentLesson = this.#lessonStore.getSnapshot();
    const preparedLesson = createActiveLessonState(command.lesson, command.steps);
    this.#workspace.validateEnvironmentConfiguration(command.environment);

    const cleanup = await this.#lifecycle.cleanup("all", "lesson-replacement");
    assertCleanupSucceeded(cleanup);

    try {
      await this.#workspace.configureEnvironment(command.environment);
      this.#lessonStore.commit({
        ...preparedLesson,
        revision: currentLesson.revision + 1,
      });
      return this.#snapshot.execute();
    } catch (error) {
      await this.#lifecycle.cleanup("all", "rollback");
      this.#lessonStore.commit({
        ...createIdleLessonState(),
        revision: currentLesson.revision + 1,
      });
      throw error;
    }
  }
}

export class ResetClassroomUseCase {
  readonly #lessonStore: LessonStoreAdapter;
  readonly #workspace: WorkspaceController;
  readonly #lifecycle: ClassroomLifecycleService;
  readonly #snapshot: GetClassroomSnapshotUseCase;

  constructor(dependencies: {
    lessonStore: LessonStoreAdapter;
    workspace: WorkspaceController;
    lifecycle: ClassroomLifecycleService;
  }) {
    this.#lessonStore = dependencies.lessonStore;
    this.#workspace = dependencies.workspace;
    this.#lifecycle = dependencies.lifecycle;
    this.#snapshot = new GetClassroomSnapshotUseCase(dependencies);
  }

  async execute(command: ResetClassroomCommand): Promise<ClassroomSnapshot> {
    const currentLesson = this.#lessonStore.getSnapshot();
    const cleanup = await this.#lifecycle.cleanup(command.scope, "reset");
    assertCleanupSucceeded(cleanup);

    if (command.scope === "runtime") {
      await this.#workspace.resetRuntime();
    } else if (command.scope === "workspace" || command.scope === "all") {
      await this.#workspace.clearEnvironment();
    }

    if (command.scope === "guidance") {
      this.#lessonStore.commit({
        ...currentLesson,
        agent: {
          status: "idle",
          ...(currentLesson.agent.message
            ? { message: currentLesson.agent.message }
            : {}),
        },
        waits: [],
        revision: currentLesson.revision + 1,
      });
    } else if (command.scope === "lesson" || command.scope === "all") {
      const idle = createIdleLessonState();
      this.#lessonStore.commit({
        ...idle,
        activity: command.preserve?.activity
          ? structuredClone(currentLesson.activity)
          : [],
        revision: currentLesson.revision + 1,
      });
    }

    return this.#snapshot.execute();
  }
}

function assertCleanupSucceeded(result: ClassroomCleanupResult): void {
  if (result.failures.length > 0) {
    throw new ClassroomCleanupError(result);
  }
}
