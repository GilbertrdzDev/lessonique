import { describe, expect, it, vi } from "vitest";

import {
  SpriteSheetAnimator,
  type SpriteSheetScheduler,
} from "./sprite-sheet-animator";

describe("SpriteSheetAnimator", () => {
  it("plays every frame with its declared duration and loops", () => {
    const scheduler = new ManualAnimationFrameScheduler();
    const frames: number[] = [];
    const animator = new SpriteSheetAnimator({
      frameDurationsMs: [100, 40, 70],
      onFrame: (frame) => frames.push(frame),
      scheduler,
    });

    animator.start();
    scheduler.step(99);
    expect(frames).toEqual([0]);
    scheduler.step(1);
    scheduler.step(40);
    scheduler.step(70);

    expect(frames).toEqual([0, 1, 2, 0]);
    expect(animator.running).toBe(true);
  });

  it("pauses without losing its frame and resumes the same cycle", () => {
    const scheduler = new ManualAnimationFrameScheduler();
    const frames: number[] = [];
    const animator = new SpriteSheetAnimator({
      frameDurationsMs: [100, 50],
      onFrame: (frame) => frames.push(frame),
      scheduler,
    });

    animator.start();
    scheduler.step(100);
    animator.pause();
    scheduler.elapse(500);

    expect(animator.frameIndex).toBe(1);
    expect(animator.paused).toBe(true);
    expect(frames).toEqual([0, 1]);

    animator.resume();
    scheduler.step(49);
    expect(frames).toEqual([0, 1]);
    scheduler.step(1);
    expect(frames).toEqual([0, 1, 0]);
  });

  it("catches up from elapsed time without emitting intermediate frames", () => {
    const scheduler = new ManualAnimationFrameScheduler();
    const onFrame = vi.fn();
    const animator = new SpriteSheetAnimator({
      frameDurationsMs: [100, 40, 70],
      onFrame,
      scheduler,
    });

    animator.start();
    scheduler.step(240);

    expect(animator.frameIndex).toBe(0);
    expect(onFrame).toHaveBeenCalledTimes(2);
    expect(onFrame).toHaveBeenLastCalledWith(0);
  });

  it("accepts and loops the preserved 16-frame timing contract", () => {
    const scheduler = new ManualAnimationFrameScheduler();
    const animator = new SpriteSheetAnimator({
      frameDurationsMs: Array.from({ length: 16 }, () => 50),
      onFrame: () => undefined,
      scheduler,
    });

    animator.start();
    scheduler.step(750);
    expect(animator.frameIndex).toBe(15);
    scheduler.step(50);
    expect(animator.frameIndex).toBe(0);
  });

  it("stops without retaining a scheduled frame", () => {
    const scheduler = new ManualAnimationFrameScheduler();
    const onFrame = vi.fn();
    const animator = new SpriteSheetAnimator({
      frameDurationsMs: [20, 20],
      onFrame,
      scheduler,
    });

    animator.start(1);
    animator.stop();
    scheduler.step(200);

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

class ManualAnimationFrameScheduler implements SpriteSheetScheduler {
  #callbacks = new Map<number, FrameRequestCallback>();
  #handle = 0;
  #nowMs = 0;

  cancelFrame(handle: number): void {
    this.#callbacks.delete(handle);
  }

  elapse(durationMs: number): void {
    this.#nowMs += durationMs;
  }

  now(): number {
    return this.#nowMs;
  }

  requestFrame(callback: FrameRequestCallback): number {
    this.#handle += 1;
    this.#callbacks.set(this.#handle, callback);
    return this.#handle;
  }

  step(durationMs: number): void {
    this.#nowMs += durationMs;
    const callbacks = [...this.#callbacks.values()];
    this.#callbacks.clear();
    callbacks.forEach((callback) => callback(this.#nowMs));
  }
}
