import {
  DEFAULT_SYSTEM_LIMITS,
  type GuidanceEffectInput,
} from "@/core/platform/contracts";
import type { ProviderPlatformRegistries } from "@/core/platform/registries";
import { validateClosedJsonObjectInput } from "@/core/platform/json-schema";
import type {
  ClassroomLifecycleService,
  LessonState,
  LessonStateReader,
} from "@/core/lesson";
import type { TargetResolverFacade } from "@/core/workspace/target-resolver-facade";

import type {
  ScenePreparation,
  SceneSnapshot,
  TeachingScene,
  TeachingSceneBeat,
  TeachingSceneBeatType,
} from "./contracts";
import { SceneLifecycleScope } from "./lifecycle";
import type { MonacoGuidanceAdapter } from "./monaco-guidance-adapter";
import { PlacementEngine } from "./placement";
import {
  AssistantActor,
  cancellableDelay,
  GuidanceEffectPresenter,
  GuidanceMotionEngine,
  VisualGuidePresenter,
} from "./presentation";
import {
  ScenePresentationStore,
  SceneStore,
  targetGeometryFromPresentation,
} from "./store";
import { TargetTracker } from "./target-tracker";
import type { WaitCoordinator, WaitCoordinatorResult } from "./wait-coordinator";

export type SceneControlAction =
  | "pause"
  | "resume"
  | "next"
  | "previous"
  | "restart"
  | "cancel";

export interface SceneSurfacePreparer {
  prepare(preparation: ScenePreparation, signal: AbortSignal): Promise<void>;
}

export class SceneValidationError extends Error {
  readonly code = "invalid_teaching_scene";

  constructor(message: string) {
    super(message);
    this.name = "SceneValidationError";
  }
}

export class SceneControlError extends Error {
  readonly code = "invalid_scene_control";

  constructor(message: string) {
    super(message);
    this.name = "SceneControlError";
  }
}

export class SceneTargetError extends Error {
  readonly code = "scene_target_unavailable";

  constructor(message: string) {
    super(message);
    this.name = "SceneTargetError";
  }
}

export interface SceneRunnerOptions {
  platform: ProviderPlatformRegistries;
  lesson: LessonStateReader;
  lifecycle: ClassroomLifecycleService;
  targets: TargetResolverFacade;
  surfacePreparer: SceneSurfacePreparer;
  waits: WaitCoordinator;
  store?: SceneStore;
  presentation?: ScenePresentationStore;
  placement?: PlacementEngine;
  monacoGuidance?: MonacoGuidanceAdapter;
  getViewport?(): { width: number; height: number };
  prefersReducedMotion?(): boolean;
  beatDurationMs?: number;
  targetRecoveryMs?: number;
}

type ActiveScene = {
  scene: TeachingScene;
  scope: SceneLifecycleScope;
  index: number;
  requestedIndex?: number;
  paused: boolean;
  beatAbort?: AbortController;
  resumeListeners: Set<() => void>;
};

export class SceneRunner {
  readonly #platform: ProviderPlatformRegistries;
  readonly #lesson: LessonStateReader;
  readonly #lifecycle: ClassroomLifecycleService;
  readonly #targets: TargetResolverFacade;
  readonly #surfacePreparer: SceneSurfacePreparer;
  readonly #waits: WaitCoordinator;
  readonly #store: SceneStore;
  readonly #presentation: ScenePresentationStore;
  readonly #placement: PlacementEngine;
  readonly #actor: AssistantActor;
  readonly #motion: GuidanceMotionEngine;
  readonly #guides: VisualGuidePresenter;
  readonly #effects: GuidanceEffectPresenter;
  readonly #monacoGuidance?: MonacoGuidanceAdapter;
  readonly #getViewport: () => { width: number; height: number };
  readonly #prefersReducedMotion: () => boolean;
  readonly #beatDurationMs: number;
  readonly #targetRecoveryMs: number;
  #active?: ActiveScene;

  constructor(options: SceneRunnerOptions) {
    this.#platform = options.platform;
    this.#lesson = options.lesson;
    this.#lifecycle = options.lifecycle;
    this.#targets = options.targets;
    this.#surfacePreparer = options.surfacePreparer;
    this.#waits = options.waits;
    this.#store = options.store ?? new SceneStore();
    this.#presentation = options.presentation ?? new ScenePresentationStore();
    this.#placement = options.placement ?? new PlacementEngine();
    this.#actor = new AssistantActor(this.#presentation);
    this.#motion = new GuidanceMotionEngine(this.#actor);
    this.#guides = new VisualGuidePresenter(this.#presentation);
    this.#effects = new GuidanceEffectPresenter(this.#presentation);
    this.#monacoGuidance = options.monacoGuidance;
    this.#getViewport =
      options.getViewport ??
      (() => ({
        width: globalThis.innerWidth || 1280,
        height: globalThis.innerHeight || 720,
      }));
    this.#prefersReducedMotion = options.prefersReducedMotion ?? (() => false);
    this.#beatDurationMs = options.beatDurationMs ?? 1_200;
    this.#targetRecoveryMs = options.targetRecoveryMs ?? 1_500;
  }

  get store(): SceneStore {
    return this.#store;
  }

  get presentation(): ScenePresentationStore {
    return this.#presentation;
  }

  validate(
    scene: TeachingScene,
    lesson: LessonState = this.#lesson.getSnapshot(),
  ): void {
    rejectForbiddenSceneFields(scene);
    if (scene.cleanupPolicy !== "replace") {
      throw new SceneValidationError("Teaching scenes must use the replace cleanup policy.");
    }
    if (
      scene.beats.length === 0 ||
      scene.beats.length > DEFAULT_SYSTEM_LIMITS.maxSceneBeats
    ) {
      throw new SceneValidationError(
        `Teaching scenes require between 1 and ${DEFAULT_SYSTEM_LIMITS.maxSceneBeats} beats.`,
      );
    }
    const beatIds = new Set<string>();
    for (const beat of scene.beats) {
      if (beatIds.has(beat.id)) {
        throw new SceneValidationError(`Scene beat "${beat.id}" is duplicated.`);
      }
      beatIds.add(beat.id);
      this.#validateBeat(beat, lesson);
    }
  }

  async start(scene: TeachingScene): Promise<SceneSnapshot> {
    this.validate(scene);
    await this.#disposeActive("cancelled");
    const prepared = structuredClone(scene);
    const scope = new SceneLifecycleScope(prepared.id, this.#lifecycle);
    const active: ActiveScene = {
      scene: prepared,
      scope,
      index: 0,
      paused: false,
      resumeListeners: new Set(),
    };
    this.#active = active;
    const reducedMotion = this.#prefersReducedMotion();
    this.#presentation.clear({ reducedMotion });
    this.#commit({
      id: prepared.id,
      status: "preparing",
      activeBeatId: prepared.beats[0]?.id,
      activeBeatIndex: 0,
      activeBeatType: prepared.beats[0]?.type ?? "explanation",
      beatCount: prepared.beats.length,
      allowManualNavigation: prepared.allowManualNavigation,
      assistant: {
        stateId: prepared.beats[0]?.assistant?.stateId ?? "assistant.explaining",
        visible: prepared.beats[0]?.assistant?.visible ?? true,
        sceneId: prepared.id,
        beatId: prepared.beats[0]?.id,
        status: "moving",
      },
    });
    void this.#run(active);
    return this.#store.getSnapshot();
  }

  async control(action: SceneControlAction, sceneId?: string): Promise<SceneSnapshot> {
    const active = this.#active;
    if (!active) {
      throw new SceneControlError("There is no active teaching scene.");
    }
    if (sceneId && active.scene.id !== sceneId) {
      throw new SceneControlError(
        `Teaching scene "${sceneId}" is not active.`,
      );
    }
    if (action === "cancel") {
      await this.#disposeActive("cancelled");
      return this.#store.getSnapshot();
    }
    if (action === "pause") {
      if (!active.paused) {
        active.paused = true;
        this.#setPaused(true);
      }
      return this.#store.getSnapshot();
    }
    if (action === "resume") {
      if (active.paused) {
        active.paused = false;
        this.#setPaused(false);
        active.resumeListeners.forEach((resume) => resume());
        active.resumeListeners.clear();
      }
      return this.#store.getSnapshot();
    }
    if (!active.scene.allowManualNavigation && action !== "restart") {
      throw new SceneControlError("The active scene does not allow manual navigation.");
    }
    const activeBeat = active.scene.beats[active.index];
    if (action === "next" && activeBeat?.wait && this.#store.getSnapshot().status === "waiting") {
      throw new SceneControlError(
        "Complete the required learner interaction before moving to the next step.",
      );
    }
    active.requestedIndex =
      action === "restart"
        ? 0
        : action === "next"
          ? Math.min(active.index + 1, active.scene.beats.length)
          : Math.max(active.index - 1, 0);
    active.beatAbort?.abort();
    return this.#store.getSnapshot();
  }

  async dispose(): Promise<void> {
    await this.#disposeActive("cancelled");
  }

  async #run(active: ActiveScene): Promise<void> {
    let index = 0;
    try {
      while (this.#active === active && index < active.scene.beats.length) {
        await this.#waitWhilePaused(active);
        if (active.requestedIndex !== undefined) {
          index = active.requestedIndex;
          active.requestedIndex = undefined;
          if (index >= active.scene.beats.length) break;
        }
        active.index = index;
        const beat = active.scene.beats[index];
        if (!beat) break;
        const beatAbort = new AbortController();
        active.beatAbort = beatAbort;
        const signal = AbortSignal.any([active.scope.signal, beatAbort.signal]);
        const cleanupBeat = await this.#enterBeat(active, beat, index, signal);
        try {
          let waitResult: WaitCoordinatorResult | undefined;
          if (beat.wait) {
            this.#setSceneStatus("waiting", beat);
            this.#actor.setState(
              beat.type === "interaction" ? "assistant.waiting" : "assistant.thinking",
              "waiting",
            );
            waitResult = await this.#waits.waitFor(
              `${active.scene.id}.${beat.id}.wait`,
              beat.wait,
              signal,
            );
            if (waitResult.status !== "cancelled") {
              this.#presentation.patch((current) => ({
                ...current,
                phase: "feedback",
              }));
              this.#actor.setState(
                waitResult.outcome === "success"
                  ? "assistant.success"
                  : "assistant.error",
              );
              if (waitResult.hint) this.#guides.showHint(waitResult.hint);
              await cancellableDelay(650, signal);
            }
          } else if (active.scene.allowManualNavigation) {
            this.#setSceneStatus("waiting", beat);
            await waitForManualNavigation(signal);
          } else {
            this.#setSceneStatus("playing", beat);
            await cancellableDelay(this.#beatDurationMs, signal);
          }
          await this.#waitWhilePaused(active);
        } catch (error) {
          if (!isAbortError(error)) throw error;
        } finally {
          await cleanupBeat();
          active.beatAbort = undefined;
        }
        if (active.scope.signal.aborted) throw createAbortError();
        if (active.requestedIndex !== undefined) {
          index = active.requestedIndex;
          active.requestedIndex = undefined;
        } else {
          index += 1;
        }
      }
      if (this.#active === active && !active.scope.signal.aborted) {
        await active.scope.dispose();
        this.#active = undefined;
        this.#presentation.clear({ reducedMotion: this.#prefersReducedMotion() });
        this.#commit({
          id: active.scene.id,
          status: "completed",
          assistant: {
            stateId: "assistant.idle",
            visible: false,
            sceneId: active.scene.id,
            status: "idle",
          },
        });
      }
    } catch (error) {
      if (this.#active !== active) return;
      const cancelled = isAbortError(error) || active.scope.signal.aborted;
      try {
        await active.scope.dispose();
      } finally {
        this.#active = undefined;
        this.#presentation.clear({ reducedMotion: this.#prefersReducedMotion() });
        this.#commit({
          id: active.scene.id,
          status: cancelled ? "cancelled" : "failed",
          assistant: {
            stateId: cancelled ? "assistant.idle" : "assistant.warning",
            visible: !cancelled,
            sceneId: active.scene.id,
            status: "idle",
          },
          ...(cancelled ? {} : { error: toSceneFailure(error) }),
        });
      }
    }
  }

  async #enterBeat(
    active: ActiveScene,
    beat: TeachingSceneBeat,
    index: number,
    signal: AbortSignal,
  ): Promise<() => Promise<void>> {
    this.#commit({
      id: active.scene.id,
      status: "preparing",
      activeBeatId: beat.id,
      activeBeatIndex: index,
      activeBeatType: beat.type ?? "explanation",
      beatCount: active.scene.beats.length,
      allowManualNavigation: active.scene.allowManualNavigation,
      ...(beat.target ? { target: structuredClone(beat.target) } : {}),
      ...(beat.wait ? { wait: structuredClone(beat.wait) } : {}),
      assistant: {
        stateId: beat.assistant?.stateId ?? "assistant.explaining",
        visible: beat.assistant?.visible ?? true,
        sceneId: active.scene.id,
        beatId: beat.id,
        ...(beat.target ? { target: structuredClone(beat.target) } : {}),
        status: "moving",
      },
    });
    const beatType = beat.type ?? "explanation";
    const interactionBeat = beatType === "interaction";
    const effectiveAssistant = interactionBeat
      ? {
          stateId: "assistant.waiting",
          placementId: "placement.floating",
          visible: beat.assistant?.visible ?? true,
        }
      : beat.assistant;
    const effectiveEffects = interactionBeat ? [] : beat.effects;
    this.#presentation.patch((current) => ({
      ...current,
      phase: phaseForBeatType(beatType),
      navigation: {
        enabled: active.scene.allowManualNavigation,
        current: index + 1,
        total: active.scene.beats.length,
        canGoPrevious: active.scene.allowManualNavigation && index > 0,
        canGoNext: active.scene.allowManualNavigation,
        nextBlocked: Boolean(beat.wait),
      },
    }));
    if (beat.prepare) await this.#surfacePreparer.prepare(beat.prepare, signal);

    const cleanups: Array<() => Promise<void>> = [];
    let tracker: TargetTracker | undefined;
    if (beat.target) {
      tracker = await this.#resolveTarget(beat, signal);
      if (tracker) {
        const disposeTarget = active.scope.add({
          id: `${active.scene.id}.${beat.id}.target`,
          kind: "observer",
          dispose: () => tracker?.dispose(),
        });
        cleanups.push(disposeTarget);
        const updateTarget = () => {
          const tracked = tracker?.getSnapshot();
          if (!tracked) return;
          this.#presentation.patch((current) => ({
            ...current,
            targetSnapshot: structuredClone(tracked.resolved),
          }));
          const viewport = this.#getViewport();
          const position = this.#placement.calculate({
            placementId: effectiveAssistant?.placementId,
            target:
              tracked.resolved.status === "resolved"
                ? tracked.resolved.geometry
                : undefined,
            viewport,
            guideSize: estimateGuideSize(beat, viewport.height),
          });
          this.#actor.setPosition(position, "presenting");
        };
        updateTarget();
        const unsubscribe = tracker.subscribe(updateTarget);
        const disposeSubscription = active.scope.add({
          id: `${active.scene.id}.${beat.id}.target-subscription`,
          kind: "observer",
          dispose: unsubscribe,
        });
        cleanups.push(disposeSubscription);
      }
    }

    this.#actor.present(active.scene.id, beat.id, effectiveAssistant, beat.target);
    const targetGeometry = targetGeometryFromPresentation(
      this.#presentation.getSnapshot(),
    );
    const viewport = this.#getViewport();
    const position = this.#placement.calculate({
      placementId: effectiveAssistant?.placementId,
      target: targetGeometry,
      viewport,
      guideSize: estimateGuideSize(beat, viewport.height),
    });
    await this.#motion.moveTo(position, this.#prefersReducedMotion(), signal);
    this.#effects.show(effectiveEffects);
    const disposeEffects = active.scope.add({
      id: `${active.scene.id}.${beat.id}.effects`,
      kind: "overlay",
      dispose: () => this.#effects.clear(),
    });
    cleanups.push(disposeEffects);
    const clearMonaco = this.#monacoGuidance?.apply(beat.target, effectiveEffects);
    if (clearMonaco) {
      cleanups.push(
        active.scope.add({
          id: `${active.scene.id}.${beat.id}.editor-guidance`,
          kind: "overlay",
          dispose: clearMonaco,
        }),
      );
    }
    this.#guides.show(beat.guide, beat.caption);
    const disposeGuide = active.scope.add({
      id: `${active.scene.id}.${beat.id}.guide`,
      kind: "visual-guide",
      dispose: () => this.#guides.clear(),
    });
    cleanups.push(disposeGuide);
    return async () => {
      for (const cleanup of cleanups.reverse()) await cleanup();
    };
  }

  async #resolveTarget(
    beat: TeachingSceneBeat,
    signal: AbortSignal,
  ): Promise<TargetTracker | undefined> {
    const target = beat.target;
    if (!target) return undefined;
    const recovery = beat.targetLossRecovery ?? "wait";
    const attempts = recovery === "retry" ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await this.#targets.prepare(target, signal);
      const handle = await this.#targets.resolve(target, signal);
      const tracker = new TargetTracker(target, handle);
      if (
        tracker.getSnapshot().resolved.status === "resolved" ||
        (await tracker.waitForResolved(this.#targetRecoveryMs, signal))
      ) {
        return tracker;
      }
      tracker.dispose();
    }
    if (recovery === "skip") return undefined;
    throw new SceneTargetError(
      `Semantic target "${target.resolverId}" could not be resolved.`,
    );
  }

  #validateBeat(beat: TeachingSceneBeat, lesson: LessonState): void {
    if (beat.type === "interaction" && !beat.wait) {
      throw new SceneValidationError(
        "Interaction beats require a registered learner wait condition.",
      );
    }
    if (beat.type === "validation" && beat.wait?.kind !== "validation") {
      throw new SceneValidationError(
        "Validation beats require a validation wait condition.",
      );
    }
    if (beat.guide?.body.length && beat.guide.body.length > DEFAULT_SYSTEM_LIMITS.maxVisualGuideBodyCharacters) {
      throw new SceneValidationError("The visual guide body exceeds the system limit.");
    }
    if ((beat.guide?.supportingItems?.length ?? 0) > DEFAULT_SYSTEM_LIMITS.maxVisualGuideItems) {
      throw new SceneValidationError("The visual guide has too many supporting items.");
    }
    if (
      beat.guide?.supportingItems?.some(
        (item) =>
          item.length > DEFAULT_SYSTEM_LIMITS.maxVisualGuideItemCharacters,
      )
    ) {
      throw new SceneValidationError("A visual guide supporting item exceeds the system limit.");
    }
    if (beat.caption && beat.caption.length > DEFAULT_SYSTEM_LIMITS.maxCaptionCharacters) {
      throw new SceneValidationError("The scene caption exceeds the system limit.");
    }
    if (beat.prepare?.surfaceId) {
      this.#platform.surfaces.require(beat.prepare.surfaceId);
    }
    let targetResolverId: string | undefined;
    if (beat.target) {
      targetResolverId = this.#platform.targetResolvers.validateReference(beat.target).id;
    }
    for (const effect of beat.effects) {
      this.#validateEffect(effect, targetResolverId);
    }
    if (beat.assistant) {
      this.#platform.guidance.assistantStates.require(beat.assistant.stateId);
      if (beat.assistant.placementId) {
        const placement = this.#platform.guidance.assistantPlacements.require(
          beat.assistant.placementId,
        );
        if (placement.requiresTarget && !beat.target) {
          throw new SceneValidationError(
            `Assistant placement "${placement.id}" requires a semantic target.`,
          );
        }
      }
    }
    if (beat.wait?.kind === "interaction") {
      const event = this.#platform.guidance.interactionEventTypes.require(
        beat.wait.eventTypeId,
      );
      void event;
      if (beat.wait.target) {
        const resolver = this.#platform.targetResolvers.validateReference(
          beat.wait.target,
        );
        if (!resolver.supportedInteractionEventTypeIds.includes(beat.wait.eventTypeId)) {
          throw new SceneValidationError(
            `Interaction event "${beat.wait.eventTypeId}" is not supported by target resolver "${resolver.id}".`,
          );
        }
      }
    }
    if (beat.wait?.kind === "validation") {
      const validationWait = beat.wait;
      const stepId = validationWait.lessonStepId ?? lesson.plan.activeStepId;
      const criterion = lesson.plan.steps
        .find(({ id }) => id === stepId)
        ?.criteria.find(({ id }) => id === validationWait.criterionId);
      if (!criterion) {
        throw new SceneValidationError(
          `Validation criterion "${validationWait.criterionId}" is not active in the lesson.`,
        );
      }
      this.#platform.validators.require(criterion.validatorId);
    }
  }

  #validateEffect(
    effect: GuidanceEffectInput,
    targetResolverId?: string,
  ): void {
    const definition = this.#platform.guidance.effects.require(effect.effectId);
    validateClosedJsonObjectInput(
      definition.inputSchema,
      effect.input ?? {},
      `Guidance effect "${definition.id}" input`,
    );
    if (!targetResolverId) {
      throw new SceneValidationError(
        `Guidance effect "${definition.id}" requires a semantic target.`,
      );
    }
    const resolver = this.#platform.targetResolvers.require(targetResolverId);
    if (!resolver.supportedEffectIds.includes(effect.effectId)) {
      throw new SceneValidationError(
        `Guidance effect "${effect.effectId}" is not supported by target resolver "${resolver.id}".`,
      );
    }
  }

  #setSceneStatus(status: "playing" | "waiting", beat: TeachingSceneBeat): void {
    const snapshot = this.#store.getSnapshot();
    const next: Omit<SceneSnapshot, "revision"> & { revision?: number } = {
      ...snapshot,
      status,
      ...(beat.wait ? { wait: structuredClone(beat.wait) } : {}),
      assistant: {
        ...snapshot.assistant,
        status: status === "waiting" ? "waiting" : "presenting",
      },
    };
    if (!beat.wait) delete next.wait;
    this.#commit(next);
  }

  #setPaused(paused: boolean): void {
    const snapshot = this.#store.getSnapshot();
    this.#commit({
      ...snapshot,
      status:
        paused
          ? "paused"
          : snapshot.wait || this.#active?.scene.allowManualNavigation
            ? "waiting"
            : "playing",
    });
    this.#presentation.patch((current) => ({ ...current, paused }));
  }

  #waitWhilePaused(active: ActiveScene): Promise<void> {
    if (!active.paused) return Promise.resolve();
    return new Promise<void>((resolve) => active.resumeListeners.add(resolve));
  }

  async #disposeActive(status: "cancelled"): Promise<void> {
    const active = this.#active;
    if (!active) return;
    this.#active = undefined;
    active.resumeListeners.forEach((resume) => resume());
    active.resumeListeners.clear();
    await active.scope.dispose();
    this.#presentation.clear({ reducedMotion: this.#prefersReducedMotion() });
    this.#commit({
      id: active.scene.id,
      status,
      assistant: {
        stateId: "assistant.idle",
        visible: false,
        sceneId: active.scene.id,
        status: "idle",
      },
    });
  }

  #commit(snapshot: Omit<SceneSnapshot, "revision"> & { revision?: number }): void {
    const current = this.#store.getSnapshot();
    this.#store.commit({
      ...snapshot,
      revision: snapshot.revision ?? current.revision + 1,
    });
  }
}

function estimateGuideSize(
  beat: TeachingSceneBeat,
  viewportHeight: number,
): { width: number; height: number } {
  const callout = beat.effects.find(({ effectId }) => effectId === "effect.callout")
    ?.input?.text;
  const calloutText = typeof callout === "string" ? callout : undefined;
  if (!beat.guide && !beat.caption && !calloutText && !beat.wait) {
    return { width: 0, height: 0 };
  }

  let lines = 0;
  if (beat.guide?.title) lines += estimateTextLines(beat.guide.title, 32);
  if (beat.guide?.body) lines += estimateTextLines(beat.guide.body, 42);
  lines +=
    beat.guide?.supportingItems?.reduce(
      (total, item) => total + estimateTextLines(item, 38),
      0,
    ) ?? 0;
  if (calloutText) lines += estimateTextLines(calloutText, 38) + 1;
  if (beat.caption) lines += estimateTextLines(beat.caption, 42) + 1;
  if (beat.wait) lines += 9;

  return {
    width: 300,
    height: Math.min(Math.max(112, 64 + lines * 18), viewportHeight - 32),
  };
}

function phaseForBeatType(
  type: TeachingSceneBeatType,
): "teaching" | "interaction" | "validating" | "feedback" {
  switch (type) {
    case "interaction":
      return "interaction";
    case "validation":
      return "validating";
    case "feedback":
      return "feedback";
    default:
      return "teaching";
  }
}

function waitForManualNavigation(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(createAbortError());
  return new Promise<void>((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(createAbortError()), {
      once: true,
    });
  });
}

function estimateTextLines(value: string, charactersPerLine: number): number {
  return value
    .split("\n")
    .reduce(
      (total, line) =>
        total + Math.max(1, Math.ceil(line.length / charactersPerLine)),
      0,
    );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function createAbortError(): DOMException {
  return new DOMException("The teaching scene was cancelled.", "AbortError");
}

function toSceneFailure(error: unknown): {
  code: string;
  message: string;
  recoverable: boolean;
} {
  if (error instanceof SceneTargetError) {
    return { code: error.code, message: error.message, recoverable: true };
  }
  if (error instanceof SceneValidationError) {
    return { code: error.code, message: error.message, recoverable: true };
  }
  return {
    code: "scene_execution_failed",
    message: "The teaching scene could not complete.",
    recoverable: false,
  };
}

const FORBIDDEN_SCENE_KEYS = new Set([
  "audio",
  "audioresponse",
  "mediaurl",
  "narration",
  "playback",
  "speech",
  "speechsynthesis",
  "ssml",
  "texttospeech",
  "tts",
  "voice",
  "voiceid",
  "webspeechapi",
]);

function rejectForbiddenSceneFields(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach(rejectForbiddenSceneFields);
    return;
  }
  Object.entries(value).forEach(([key, item]) => {
    const normalizedKey = key.replaceAll(/[^a-z0-9]/giu, "").toLowerCase();
    if (FORBIDDEN_SCENE_KEYS.has(normalizedKey)) {
      throw new SceneValidationError(
        `Teaching scenes do not support "${key}" in P0/V1.`,
      );
    }
    rejectForbiddenSceneFields(item);
  });
}
