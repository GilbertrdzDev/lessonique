import type {
  AssistantPresentationInput,
  GuidanceEffectInput,
  TargetRef,
  VisualGuideInput,
} from "@/core/platform/contracts";

import type { ScenePresentationPosition, ScenePresentationStore } from "./store";

export class AssistantActor {
  readonly #store: ScenePresentationStore;

  constructor(store: ScenePresentationStore) {
    this.#store = store;
  }

  present(
    sceneId: string,
    beatId: string,
    presentation: AssistantPresentationInput | undefined,
    target: TargetRef | undefined,
  ): void {
    this.#store.patch((current) => ({
      ...current,
      sceneId,
      beatId,
      ...(target ? { target: structuredClone(target) } : {}),
      assistant: {
        ...current.assistant,
        stateId: presentation?.stateId ?? "assistant.explaining",
        ...(presentation?.placementId
          ? { placementId: presentation.placementId }
          : {}),
        visible: presentation?.visible ?? true,
        status: "presenting",
      },
    }));
  }

  setState(stateId: string, status: "presenting" | "waiting" = "presenting"): void {
    this.#store.patch((current) =>
      current.assistant.stateId === stateId && current.assistant.status === status
        ? current
        : {
            ...current,
            assistant: { ...current.assistant, stateId, status },
          },
    );
  }

  setPosition(
    position: ScenePresentationPosition,
    status: "moving" | "presenting",
  ): void {
    this.#store.patch((current) => ({
      ...current,
      assistant: { ...current.assistant, position: { ...position }, status },
    }));
  }

  hide(): void {
    this.#store.patch((current) => ({
      ...current,
      assistant: {
        ...current.assistant,
        visible: false,
        status: "idle",
      },
    }));
  }
}

export class GuidanceMotionEngine {
  readonly #actor: AssistantActor;
  readonly #durationMs: number;

  constructor(actor: AssistantActor, durationMs = 520) {
    this.#actor = actor;
    this.#durationMs = durationMs;
  }

  async moveTo(
    position: ScenePresentationPosition,
    reducedMotion: boolean,
    signal: AbortSignal,
  ): Promise<void> {
    throwIfAborted(signal);
    this.#actor.setPosition(position, reducedMotion ? "presenting" : "moving");
    if (!reducedMotion) await cancellableDelay(this.#durationMs, signal);
    throwIfAborted(signal);
    this.#actor.setPosition(position, "presenting");
  }
}

export class VisualGuidePresenter {
  readonly #store: ScenePresentationStore;

  constructor(store: ScenePresentationStore) {
    this.#store = store;
  }

  show(guide?: VisualGuideInput, caption?: string): void {
    this.#store.patch((current) => ({
      ...current,
      ...(guide ? { guide: structuredClone(guide) } : {}),
      ...(caption ? { caption } : {}),
    }));
  }

  clear(): void {
    this.#store.patch((current) => {
      const next = { ...current };
      delete next.guide;
      delete next.caption;
      delete next.hint;
      return next;
    });
  }

  showHint(hint: string): void {
    this.#store.patch((current) => ({ ...current, hint }));
  }
}

export class GuidanceEffectPresenter {
  readonly #store: ScenePresentationStore;

  constructor(store: ScenePresentationStore) {
    this.#store = store;
  }

  show(effects: readonly GuidanceEffectInput[]): void {
    this.#store.patch((current) => ({
      ...current,
      effects: structuredClone(effects),
    }));
  }

  clear(): void {
    this.#store.patch((current) => ({ ...current, effects: [] }));
  }
}

export function cancellableDelay(
  durationMs: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new DOMException("Scene work was cancelled.", "AbortError"));
  }
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(finish, durationMs);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(new DOMException("Scene work was cancelled.", "AbortError"));
    };
    function finish() {
      signal.removeEventListener("abort", abort);
      resolve();
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("Scene work was cancelled.", "AbortError");
  }
}
