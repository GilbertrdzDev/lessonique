import { describe, expect, it, vi } from "vitest";

import { ObservableTargetHandle } from "@/core/workspace/targeting";

import { TargetTracker } from "./target-tracker";

describe("TargetTracker", () => {
  it("coalesces geometry changes and reports loss and recovery", () => {
    const handle = new ObservableTargetHandle({ status: "lost" });
    const frames: FrameRequestCallback[] = [];
    const cancelFrame = vi.fn();
    const tracker = new TargetTracker(
      { resolverId: "target.fake", input: { anchorId: "anchor.fake" } },
      handle,
      {
        requestFrame: (callback) => {
          frames.push(callback);
          return frames.length;
        },
        cancelFrame,
      },
    );
    const snapshots: string[] = [];
    tracker.subscribe(({ status }) => snapshots.push(status));

    handle.update({
      status: "resolved",
      geometry: { left: 10, top: 20, width: 30, height: 40 },
    });
    handle.update({
      status: "resolved",
      geometry: { left: 11, top: 21, width: 30, height: 40 },
    });
    expect(frames).toHaveLength(1);
    frames.at(-1)?.(0);
    handle.update({ status: "lost" });
    frames.at(-1)?.(0);
    handle.update({
      status: "resolved",
      geometry: { left: 12, top: 22, width: 30, height: 40 },
    });
    frames.at(-1)?.(0);

    expect(snapshots).toEqual(["recovered", "lost", "recovered"]);
    expect(tracker.getSnapshot().resolved).toEqual(
      expect.objectContaining({
        status: "resolved",
        geometry: expect.objectContaining({ left: 12, top: 22 }),
      }),
    );
    tracker.dispose();
    expect(cancelFrame).not.toHaveBeenCalled();
  });

  it("cancels pending geometry work and subscriptions on disposal", () => {
    const handle = new ObservableTargetHandle({ status: "lost" });
    const frames: FrameRequestCallback[] = [];
    const cancelFrame = vi.fn();
    const listener = vi.fn();
    const tracker = new TargetTracker(
      { resolverId: "target.fake", input: { anchorId: "anchor.fake" } },
      handle,
      {
        requestFrame: (callback) => {
          frames.push(callback);
          return 41;
        },
        cancelFrame,
      },
    );
    tracker.subscribe(listener);

    handle.update({
      status: "resolved",
      geometry: { left: 10, top: 20, width: 30, height: 40 },
    });
    tracker.dispose();
    frames[0]?.(0);
    handle.update({ status: "lost" });

    expect(cancelFrame).toHaveBeenCalledWith(41);
    expect(listener).not.toHaveBeenCalled();
  });
});
