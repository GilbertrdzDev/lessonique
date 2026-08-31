import { describe, expect, it, vi } from "vitest";

import { ObservableTargetHandle } from "@/core/workspace/targeting";

import { TargetTracker } from "./target-tracker";

describe("TargetTracker", () => {
  it("coalesces geometry changes and reports loss and recovery", () => {
    const handle = new ObservableTargetHandle({ status: "lost" });
    const frames: FrameRequestCallback[] = [];
    const tracker = new TargetTracker(
      { resolverId: "target.fake", input: { anchorId: "anchor.fake" } },
      handle,
      {
        requestFrame: (callback) => {
          frames.push(callback);
          return frames.length;
        },
        cancelFrame: vi.fn(),
      },
    );
    const snapshots: string[] = [];
    tracker.subscribe(({ status }) => snapshots.push(status));

    handle.update({
      status: "resolved",
      geometry: { left: 10, top: 20, width: 30, height: 40 },
    });
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
      expect.objectContaining({ status: "resolved" }),
    );
    tracker.dispose();
  });
});
