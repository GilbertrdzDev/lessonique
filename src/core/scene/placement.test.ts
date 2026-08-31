import { describe, expect, it } from "vitest";

import { PlacementEngine } from "./placement";

describe("PlacementEngine", () => {
  it("places the companion beside a target without covering it", () => {
    const placement = new PlacementEngine().calculate({
      placementId: "placement.near-target",
      target: { left: 100, top: 120, width: 200, height: 80 },
      viewport: { width: 1200, height: 800 },
    });

    expect(placement).toEqual({
      left: 316,
      top: 104,
      docked: false,
      side: "right",
      facing: "left",
      companionOffsetLeft: 0,
      companionOffsetTop: 34,
    });
  });

  it("uses a clamped dock when target-relative space is unavailable", () => {
    const placement = new PlacementEngine().calculate({
      placementId: "placement.near-target",
      target: { left: 20, top: 20, width: 280, height: 180 },
      viewport: { width: 360, height: 320 },
    });

    expect(placement).toEqual({
      left: 16,
      top: 124,
      docked: true,
      side: "docked",
      facing: "left",
      companionOffsetLeft: 0,
      companionOffsetTop: 68,
    });
  });

  it("clamps a side placement for a tall guide without covering the target", () => {
    const placement = new PlacementEngine().calculate({
      placementId: "placement.near-target",
      target: { left: 1_100, top: 700, width: 240, height: 120 },
      viewport: { width: 1_366, height: 900 },
      guideSize: { width: 300, height: 360 },
    });

    expect(placement).toEqual({
      left: 656,
      top: 524,
      docked: false,
      side: "left",
      facing: "right",
      companionOffsetLeft: 316,
      companionOffsetTop: 124,
    });
  });

  it("clamps a tall guide beside a responsive target", () => {
    const placement = new PlacementEngine().calculate({
      placementId: "placement.near-target",
      target: { left: 28, top: 536, width: 435, height: 336 },
      viewport: { width: 1_366, height: 900 },
      guideSize: { width: 300, height: 360 },
    });

    expect(placement).toEqual({
      left: 479,
      top: 524,
      docked: false,
      side: "right",
      facing: "left",
      companionOffsetLeft: 0,
      companionOffsetTop: 124,
    });
  });

  it("keeps a guide-less companion next to the target without a phantom gap", () => {
    const placement = new PlacementEngine().calculate({
      placementId: "placement.near-target",
      target: { left: 40, top: 160, width: 120, height: 40 },
      viewport: { width: 480, height: 360 },
      guideSize: { width: 0, height: 0 },
    });

    expect(placement).toEqual({
      left: 176,
      top: 124,
      docked: false,
      side: "right",
      facing: "left",
      companionOffsetLeft: 0,
      companionOffsetTop: 0,
    });
  });
});
