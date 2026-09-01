import type { LessonState } from "@/core/lesson";
import {
  SceneControlError,
  SceneRunner,
  SceneValidationError,
  type SceneSnapshot,
  type TeachingScene,
} from "@/core/scene";

import type {
  ControlTeachingSceneInput,
  PlayTeachingSceneInput,
  TeachingSceneInput,
  ToolExecutionResult,
} from "./contracts";
import { ToolInvocationError } from "./tool-invocation-service";

export type PlayTeachingSceneData = ReturnType<typeof toSceneData> & {
  beatCount: number;
  structuredGuideBeatIds: string[];
};
export type ControlTeachingSceneData = ReturnType<typeof toSceneData> & {
  action: ControlTeachingSceneInput["action"];
};

export class TeachingSceneToolService {
  readonly #runner: SceneRunner;

  constructor(runner: SceneRunner) {
    this.#runner = runner;
  }

  validate(input: TeachingSceneInput, lesson?: LessonState): TeachingScene {
    const scene = toTeachingScene(input);
    try {
      this.#runner.validate(scene, lesson);
      return scene;
    } catch (error) {
      throw normalizeSceneValidationError(error);
    }
  }

  async play(
    input: PlayTeachingSceneInput,
    signal?: AbortSignal,
  ): Promise<ToolExecutionResult<PlayTeachingSceneData>> {
    throwIfAborted(signal);
    const scene = this.validate(input);
    try {
      const snapshot = await this.#runner.start(scene);
      throwIfAborted(signal);
      return {
        ok: true,
        status: "started",
        revision: snapshot.revision,
        data: {
          ...toSceneData(snapshot),
          beatCount: scene.beats.length,
          structuredGuideBeatIds: scene.beats
            .filter(({ guide }) => Boolean(guide))
            .map(({ id }) => id),
        },
      };
    } catch (error) {
      throw normalizeSceneOperationError(error, "scene_start_failed");
    }
  }

  async control(
    input: ControlTeachingSceneInput,
    signal?: AbortSignal,
  ): Promise<ToolExecutionResult<ControlTeachingSceneData>> {
    throwIfAborted(signal);
    try {
      const snapshot = await this.#runner.control(input.action, input.sceneId);
      throwIfAborted(signal);
      return {
        ok: input.action !== "cancel",
        status: input.action === "cancel" ? "cancelled" : "completed",
        revision: snapshot.revision,
        data: {
          ...toSceneData(snapshot),
          action: input.action,
        },
      };
    } catch (error) {
      throw normalizeSceneOperationError(error, "scene_control_failed");
    }
  }
}

export function toTeachingScene(input: TeachingSceneInput): TeachingScene {
  return {
    id: input.id,
    ...(input.title ? { title: input.title } : {}),
    cleanupPolicy: input.cleanupPolicy ?? "replace",
    allowManualNavigation: input.allowManualNavigation ?? false,
    beats: input.beats.map((beat) => ({
      id: beat.id,
      type: beat.type,
      ...(beat.prepare ? { prepare: structuredClone(beat.prepare) } : {}),
      ...(beat.target
        ? {
            target: structuredClone(beat.target),
            targetLossRecovery: "retry" as const,
          }
        : {}),
      ...(beat.assistant ? { assistant: structuredClone(beat.assistant) } : {}),
      effects: structuredClone(beat.effects ?? []),
      ...(beat.guide ? { guide: structuredClone(beat.guide) } : {}),
      ...(beat.caption ? { caption: beat.caption } : {}),
      ...(beat.wait ? { wait: structuredClone(beat.wait) } : {}),
    })),
  };
}

function toSceneData(snapshot: SceneSnapshot) {
  return {
    sceneId: snapshot.id ?? null,
    sceneStatus: snapshot.status,
    activeBeatId: snapshot.activeBeatId ?? null,
    activeBeatIndex: snapshot.activeBeatIndex ?? null,
    activeTarget: snapshot.target ? structuredClone(snapshot.target) : null,
    activeWait: snapshot.wait ? structuredClone(snapshot.wait) : null,
    assistant: {
      stateId: snapshot.assistant.stateId,
      visible: snapshot.assistant.visible,
      status: snapshot.assistant.status,
    },
  };
}

function normalizeSceneValidationError(error: unknown): ToolInvocationError {
  if (error instanceof ToolInvocationError) return error;
  return new ToolInvocationError({
    code: "invalid_teaching_scene",
    message:
      error instanceof Error ? error.message : "The teaching scene is invalid.",
    recoverable: true,
  });
}

function normalizeSceneOperationError(
  error: unknown,
  fallbackCode: "scene_start_failed" | "scene_control_failed",
): Error {
  if (error instanceof ToolInvocationError) return error;
  if (error instanceof SceneValidationError) {
    return normalizeSceneValidationError(error);
  }
  if (error instanceof SceneControlError) {
    return new ToolInvocationError({
      code: error.code,
      message: error.message,
      recoverable: true,
    });
  }
  if (error instanceof DOMException && error.name === "AbortError") return error;
  return new ToolInvocationError({
    code: fallbackCode,
    message:
      error instanceof Error
        ? error.message
        : fallbackCode === "scene_start_failed"
          ? "The teaching scene could not start."
          : "The teaching scene could not be controlled.",
    recoverable: true,
  });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new DOMException("The scene operation was cancelled.", "AbortError");
  }
}
