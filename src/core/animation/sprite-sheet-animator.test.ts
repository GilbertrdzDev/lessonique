import { afterEach, describe, expect, it, vi } from "vitest";

import { SpriteSheetAnimator } from "./sprite-sheet-animator";

afterEach(() => {
  vi.useRealTimers();
});

describe("SpriteSheetAnimator", () => {
  it("plays every frame with its declared duration and loops", () => {
    vi.useFakeTimers();
    const frames: number[] = [];
    const animator = new SpriteSheetAnimator({
      frameDurationsMs: [100, 40, 70],
      onFrame: (frame) => frames.push(frame),
    });

    animator.start();
    vi.advanceTimersByTime(99);
    expect(frames).toEqual([0]);
    vi.advanceTimersByTime(1);
    vi.advanceTimersByTime(40);
    vi.advanceTimersByTime(70);

    expect(frames).toEqual([0, 1, 2, 0]);
    expect(animator.running).toBe(true);
  });

  it("pauses without losing its frame and resumes the same cycle", () => {
    vi.useFakeTimers();
    const frames: number[] = [];
    const animator = new SpriteSheetAnimator({
      frameDurationsMs: [100, 50],
      onFrame: (frame) => frames.push(frame),
    });

    animator.start();
    vi.advanceTimersByTime(100);
    animator.pause();
    vi.advanceTimersByTime(500);

    expect(animator.frameIndex).toBe(1);
    expect(animator.paused).toBe(true);
    expect(frames).toEqual([0, 1]);

    animator.resume();
    vi.advanceTimersByTime(50);
    expect(frames).toEqual([0, 1, 0]);
  });

  it("stops without retaining a scheduled frame", () => {
    vi.useFakeTimers();
    const onFrame = vi.fn();
    const animator = new SpriteSheetAnimator({
      frameDurationsMs: [20, 20],
      onFrame,
    });

    animator.start(1);
    animator.stop();
    vi.advanceTimersByTime(200);

    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(onFrame).toHaveBeenLastCalledWith(1);
    expect(animator.running).toBe(false);
  });

  it("rejects invalid frame contracts", () => {
    expect(
      () =>
        new SpriteSheetAnimator({
          frameDurationsMs: [],
          onFrame: () => undefined,
        }),
    ).toThrow("at least one frame");
    expect(
      () =>
        new SpriteSheetAnimator({
          frameDurationsMs: [100, 0],
          onFrame: () => undefined,
        }),
    ).toThrow("positive numbers");
  });
});
