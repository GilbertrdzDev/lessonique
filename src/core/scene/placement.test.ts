import { describe, expect, it } from "vitest";

import { calculatePointerPath, PlacementEngine } from "./placement";

describe("PlacementEngine", () => {
  it("places the companion beside a target without covering it", () => {
    const placement = new PlacementEngine().calculate({
      placementId: "placement.near-target",
      target: { left: 100, top: 120, width: 200, height: 80 },
      viewport: { width: 1200, height: 800 },
    });

    expect(placement).toEqual({
      left: 316,
      top: 70,
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
      companionOffsetTop: 34,
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
      top: 460,
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
      left: 44,
      top: 32,
      docked: false,
      side: "above",
      facing: "right",
      companionOffsetLeft: 0,
      companionOffsetTop: 0,
    });
  });

  it("connects the measured companion and target boundaries", () => {
    const points = calculatePointerPath({
      assistant: { left: 100, top: 100, width: 100, height: 100 },
      target: { left: 300, top: 120, width: 80, height: 40 },
    });

    expect(points).toHaveLength(2);
    expect(points[0]!.x).toBe(200);
    expect(points[0]!.y).toBeGreaterThanOrEqual(100);
    expect(points[0]!.y).toBeLessThanOrEqual(200);
    expect(points[1]!.x).toBe(300);
    expect(points[1]!.y).toBeGreaterThanOrEqual(120);
    expect(points[1]!.y).toBeLessThanOrEqual(160);
  });

  it("keeps measured overlays inside the viewport near right and bottom edges", () => {
    const placement = new PlacementEngine().calculate({
      placementId: "placement.near-target",
      target: { left: 1_120, top: 690, width: 120, height: 50 },
      viewport: { width: 1_280, height: 760 },
      assistantSize: { width: 118, height: 108 },
      guideSize: { width: 286, height: 210 },
    });

    expect(placement.left).toBeGreaterThanOrEqual(16);
    expect(placement.top).toBeGreaterThanOrEqual(16);
    expect(placement.left + 118 + 16 + 286).toBeLessThanOrEqual(1_264);
    expect(placement.top + 210).toBeLessThanOrEqual(744);
    expect(placement.side).not.toBe("right");
  });

  it("avoids registered interface obstructions when choosing a target side", () => {
    const placement = new PlacementEngine().calculate({
      placementId: "placement.near-target",
      target: { left: 450, top: 260, width: 100, height: 30 },
      viewport: { width: 1_100, height: 700 },
      obstructions: [{ left: 566, top: 160, width: 430, height: 300 }],
    });

    expect(placement.side).not.toBe("right");
  });
});
