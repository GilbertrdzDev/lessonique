import { describe, expect, it } from "vitest";

import type { InteractionEvent } from "@/core/platform/contracts";
import type {
  InteractionEventListener,
  InteractionSourceAdapter,
} from "@/core/workspace/targeting";
import {
  createP0ProviderPlatform,
  P0_INTERACTION_ANCHOR_IDS,
  P0_INTERACTION_EVENT_TYPE_IDS,
  P0_TARGET_RESOLVER_IDS,
} from "@/providers/p0";

import { createActiveLessonState } from "./state";
import { LessonStore } from "./store";
import { ClassroomLifecycleService } from "./lifecycle";
import { AssistantIntentMapper, InteractionTracker } from "./interaction-tracker";

describe("InteractionTracker", () => {
  it("normalizes registered source events, filters private payloads, and ignores stale revisions", () => {
    const { tracker, store, source } = createHarness();
    tracker.attachSources([source]);
    source.emit({
      ...interaction("interaction.1"),
      rawEvent: { type: "click" },
      keystrokes: "private input",
      payload: { arbitrary: true },
    } as InteractionEvent);
    source.emit({ ...interaction("interaction.stale"), environmentRevision: 6 });

    expect(store.getSnapshot().interactions).toEqual([
      expect.objectContaining({
        id: "interaction.1",
        typeId: "interaction.preview-click",
        outcome: "success",
      }),
    ]);
    expect(store.getSnapshot().activity).toEqual([
      expect.objectContaining({
        id: "interaction.1",
        source: "learner",
        summary: "The learner completed the requested action for “Step 1”.",
      }),
    ]);
    expect(JSON.stringify(store.getSnapshot().activity)).not.toContain(
      "Preview target activated",
    );
    expect(JSON.stringify(store.getSnapshot())).not.toContain("private input");
    expect(store.getSnapshot().agent.assistantIntent?.stateId).toBe(
      "assistant.success",
    );
  });

  it("keeps low-level anchor activation in interaction history without promoting it", () => {
    const { tracker, store, source } = createHarness();
    tracker.attachSources([source]);

    source.emit({
      id: "interaction.anchor",
      typeId: P0_INTERACTION_EVENT_TYPE_IDS.surfaceActivate,
      targetRef: {
        resolverId: P0_TARGET_RESOLVER_IDS.surfaceAnchor,
        input: { anchorId: P0_INTERACTION_ANCHOR_IDS.activity },
      },
      surfaceId: "activity",
      environmentRevision: 7,
      occurredAt: "2026-08-30T12:00:00.000Z",
      summary: `Registered interface anchor "${P0_INTERACTION_ANCHOR_IDS.activity}" was activated.`,
    });

    expect(store.getSnapshot().interactions).toEqual([
      expect.objectContaining({ id: "interaction.anchor" }),
    ]);
    expect(store.getSnapshot().activity).toEqual([]);
  });

  it("promotes a wait-satisfying interaction once without exposing adapter text", async () => {
    const { tracker, store, source } = createHarness();
    tracker.attachSources([source]);
    const waiting = tracker.waitFor("wait.preview.context", {
      kind: "interaction",
      eventTypeId: "interaction.preview-click",
      lessonStepId: "step.1",
      timeoutMs: 1_000,
    });

    source.emit({
      ...interaction("interaction.wait"),
      outcome: undefined,
      summary: "Technical preview bridge click.",
    });

    await expect(waiting).resolves.toEqual({
      status: "satisfied",
      event: expect.objectContaining({ id: "interaction.wait" }),
    });
    expect(store.getSnapshot().activity).toEqual([
      expect.objectContaining({
        id: "interaction.wait",
        summary: "The learner completed the requested action for “Step 1”.",
      }),
    ]);
    expect(JSON.stringify(store.getSnapshot().activity)).not.toContain(
      "Technical preview bridge click",
    );
  });

  it("satisfies a local interaction wait and maps failure to a warning intent", async () => {
    const { tracker, store, source } = createHarness();
    tracker.attachSources([source]);
    const waiting = tracker.waitFor("wait.preview", {
      kind: "interaction",
      eventTypeId: "interaction.preview-click",
      lessonStepId: "step.1",
      timeoutMs: 1_000,
    });
    expect(store.getSnapshot().agent.assistantIntent?.stateId).toBe(
      "assistant.thinking",
    );

    source.emit({
      ...interaction("interaction.failure"),
      outcome: "failure",
    });

    await expect(waiting).resolves.toEqual({
      status: "satisfied",
      event: expect.objectContaining({ id: "interaction.failure" }),
    });
    expect(store.getSnapshot().waits.at(-1)).toEqual(
      expect.objectContaining({
        id: "wait.preview",
        status: "satisfied",
        resolvedByEventId: "interaction.failure",
      }),
    );
    expect(store.getSnapshot().agent.assistantIntent?.stateId).toBe(
      "assistant.warning",
    );
  });

  it("cancels pending condition subscriptions through classroom cleanup", async () => {
    const { tracker, lifecycle, source } = createHarness();
    tracker.attachSources([source]);
    const waiting = tracker.waitFor("wait.cancel", {
      kind: "interaction",
      eventTypeId: "interaction.preview-click",
      timeoutMs: 30_000,
    });

    const cleanup = await lifecycle.cleanup("guidance", "cancellation");

    expect(cleanup.failures).toEqual([]);
    expect(cleanup.retained).toBe(0);
    await expect(waiting).resolves.toEqual({ status: "cancelled" });
    expect(source.activeListeners).toBe(1);
    tracker.detachSources();
    expect(source.activeListeners).toBe(0);
  });

  it("rejects unregistered and resolver-incompatible interactions without mutation", () => {
    const { tracker, store, source } = createHarness();
    tracker.attachSources([source]);
    const previous = store.getSnapshot();
    const invalidEvents = [
      {
        ...interaction("interaction.unregistered"),
        typeId: "interaction.unregistered",
      },
      {
        ...interaction("interaction.incompatible"),
        targetRef: {
          resolverId: "target.console-entry",
          input: { entryId: "console.entry-1" },
        },
      },
    ] as InteractionEvent[];

    invalidEvents.forEach((event) => {
      expect(() => source.emit(event)).toThrow();
      expect(store.getSnapshot()).toBe(previous);
    });
  });
});

function createHarness() {
  const platform = createP0ProviderPlatform();
  const store = new LessonStore(
    createActiveLessonState(
      {
        id: "lesson.interactions",
        title: "Interactions",
        objective: "Track local learner interactions.",
      },
      [
        {
          id: "step.1",
          title: "Step 1",
          objective: "Trigger the preview action.",
          criteria: [],
          hints: [],
        },
      ],
    ),
  );
  const lifecycle = new ClassroomLifecycleService();
  const tracker = new InteractionTracker({
    store,
    platform,
    lifecycle,
    assistantIntents: new AssistantIntentMapper(platform, {
      thinking: "assistant.thinking",
      success: "assistant.success",
      warning: "assistant.warning",
    }),
    getEnvironmentRevision: () => 7,
  });
  return { tracker, store, lifecycle, source: new FakeInteractionSource() };
}

function interaction(id: string): InteractionEvent {
  return {
    id,
    typeId: "interaction.preview-click",
    surfaceId: "preview",
    lessonStepId: "step.1",
    environmentRevision: 7,
    occurredAt: "2026-08-30T12:00:00.000Z",
    summary: "Preview target activated.",
    outcome: "success",
  };
}

class FakeInteractionSource implements InteractionSourceAdapter {
  readonly #listeners = new Set<InteractionEventListener>();

  get activeListeners(): number {
    return this.#listeners.size;
  }

  subscribeToInteractions(
    listener: InteractionEventListener,
    signal: AbortSignal,
  ): void {
    this.#listeners.add(listener);
    signal.addEventListener("abort", () => this.#listeners.delete(listener), {
      once: true,
    });
  }

  emit(event: InteractionEvent): void {
    this.#listeners.forEach((listener) => listener(event));
  }
}
