import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AssistantActor,
  GuidanceMotionEngine,
} from "./presentation";
import { ScenePresentationStore } from "./store";

describe("GuidanceMotionEngine", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps the final position while skipping travel for reduced motion", async () => {
    const store = new ScenePresentationStore();
    const motion = new GuidanceMotionEngine(new AssistantActor(store), 320);
    const position = {
      left: 120,
      top: 80,
      docked: false,
      side: "right" as const,
      facing: "left" as const,
      companionOffsetLeft: 0,
      companionOffsetTop: 34,
      guideOffsetLeft: 128,
      guideOffsetTop: 0,
    };

    await motion.moveTo(position, true, new AbortController().signal);

    expect(store.getSnapshot().assistant).toEqual(
      expect.objectContaining({ position, status: "presenting" }),
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels active travel without leaving timers or a presenting transition", async () => {
    const store = new ScenePresentationStore();
    const motion = new GuidanceMotionEngine(new AssistantActor(store), 320);
    const controller = new AbortController();
    const movement = motion.moveTo(
      {
        left: 120,
        top: 80,
        docked: false,
        side: "left",
        facing: "right",
        companionOffsetLeft: 316,
        companionOffsetTop: 34,
        guideOffsetLeft: 0,
        guideOffsetTop: 0,
      },
      false,
      controller.signal,
    );

    expect(store.getSnapshot().assistant.status).toBe("moving");
    controller.abort();

    await expect(movement).rejects.toMatchObject({ name: "AbortError" });
    expect(store.getSnapshot().assistant.status).toBe("moving");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Scene presentation updates", () => {
  it("does not notify subscribers for identity patches or repeated assistant state", () => {
    const store = new ScenePresentationStore();
    const actor = new AssistantActor(store);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.patch((current) => current);
    expect(listener).not.toHaveBeenCalled();

    actor.setState("assistant.thinking", "waiting");
    actor.setState("assistant.thinking", "waiting");

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
