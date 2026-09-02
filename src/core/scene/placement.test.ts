import { describe, expect, it } from "vitest";

import type { TargetGeometry } from "@/core/workspace/targeting";

import { calculatePointerPath, PlacementEngine } from "./placement";
import type { ScenePresentationPosition } from "./store";

describe("PlacementEngine", () => {
  it("places the guide and companion inside the viewport without covering each other or the target", () => {
    const target = { left: 100, top: 120, width: 200, height: 80 };
    const placement = calculate({ target });
    assertSafePlacement(placement, target, { width: 1200, height: 800 });
  });

  it("suppresses the companion when a small viewport cannot fit every element safely", () => {
    const target = { left: 20, top: 20, width: 280, height: 180 };
    const placement = calculate({ target, viewport: { width: 360, height: 320 } });

    expect(placement.docked).toBe(true);
    expect(placement.companionSuppressed).toBe(true);
    expect(placement.guideSuppressed).toBe(true);
  });

  it("keeps a tall guide clear of a bottom-edge target", () => {
    const target = { left: 1_100, top: 700, width: 240, height: 120 };
    const placement = calculate({
      target,
      viewport: { width: 1_366, height: 900 },
      guideSize: { width: 300, height: 360 },
    });
    assertSafePlacement(
      placement,
      target,
      { width: 1_366, height: 900 },
      { width: 300, height: 360 },
    );
  });

  it("uses independent guide and companion positions around a responsive target", () => {
    const target = { left: 28, top: 536, width: 435, height: 336 };
    const placement = calculate({
      target,
      viewport: { width: 1_366, height: 900 },
      guideSize: { width: 300, height: 360 },
    });

    expect(placement.guideOffsetLeft).not.toBe(placement.companionOffsetLeft);
    assertSafePlacement(
      placement,
      target,
      { width: 1_366, height: 900 },
      { width: 300, height: 360 },
    );
  });

  it("keeps a guide-less companion next to the target without a phantom gap", () => {
    const target = { left: 40, top: 160, width: 120, height: 40 };
    const placement = calculate({
      target,
      viewport: { width: 480, height: 360 },
      guideSize: { width: 0, height: 0 },
    });

    expect(placement.guideOffsetLeft).toBe(placement.companionOffsetLeft);
    expect(placement.guideOffsetTop).toBe(placement.companionOffsetTop);
    assertNoOverlap(rectForCompanion(placement), target);
  });

  it("connects a target-adjacent point to the measured guide boundary", () => {
    const points = calculatePointerPath({
      guide: { left: 500, top: 80, width: 288, height: 200 },
      target: { left: 300, top: 120, width: 80, height: 40 },
    });

    expect(points[0]).toEqual({ x: 390, y: 140 });
    expect(points.at(-1)).toEqual({ x: 500, y: 140 });
    expectOrthogonalPath(points);
  });

  it.each([
    {
      name: "left",
      guide: { left: 20, top: 80, width: 200, height: 180 },
      targetPoint: { x: 290, y: 140 },
      guidePoint: { x: 220, y: 140 },
    },
    {
      name: "top",
      guide: { left: 250, top: 0, width: 288, height: 80 },
      targetPoint: { x: 340, y: 110 },
      guidePoint: { x: 340, y: 80 },
    },
    {
      name: "bottom",
      guide: { left: 250, top: 220, width: 288, height: 180 },
      targetPoint: { x: 340, y: 170 },
      guidePoint: { x: 340, y: 220 },
    },
  ])("adapts the connector toward the $name side", ({ guide, targetPoint, guidePoint }) => {
    const points = calculatePointerPath({
      guide,
      target: { left: 300, top: 120, width: 80, height: 40 },
    });

    expect(points[0]).toEqual(targetPoint);
    expect(points.at(-1)).toEqual(guidePoint);
    expectOrthogonalPath(points);
  });

  it("uses the closest open side instead of crossing a diagonal code region", () => {
    const points = calculatePointerPath({
      guide: { left: 500, top: 200, width: 288, height: 180 },
      target: { left: 300, top: 120, width: 80, height: 40 },
    });

    expect(points[0]).toEqual({ x: 340, y: 170 });
    expect(points.at(-1)).toEqual({ x: 522, y: 200 });
    expectOrthogonalPath(points);
  });

  it("avoids registered interface obstructions when another safe candidate exists", () => {
    const target = { left: 450, top: 260, width: 100, height: 30 };
    const obstruction = { left: 566, top: 160, width: 430, height: 300 };
    const placement = calculate({
      target,
      viewport: { width: 1_100, height: 700 },
      obstructions: [obstruction],
    });

    assertNoOverlap(rectForCompanion(placement), obstruction);
    assertNoOverlap(rectForGuide(placement), obstruction);
  });

  it("fits the guide into a narrow editor band without covering adjacent controls", () => {
    const target = { left: 347, top: 407, width: 323, height: 22 };
    const guideSize = { width: 288, height: 287 };
    const obstructions = [
      { left: 40, top: 351, width: 255, height: 480 },
      { left: 40, top: 294, width: 1_046, height: 57 },
      { left: 295, top: 648, width: 823, height: 183 },
      { left: 1_151, top: 95, width: 375, height: 736 },
    ];
    const placement = calculate({
      target,
      viewport: { width: 1_536, height: 864 },
      guideSize,
      obstructions,
    });

    const guide = rectForGuide(placement, guideSize);
    assertNoOverlap(guide, target);
    obstructions.forEach((obstruction) => assertNoOverlap(guide, obstruction));
  });
});

function expectOrthogonalPath(points: readonly { x: number; y: number }[]): void {
  expect(points.length).toBeGreaterThanOrEqual(2);
  points.slice(1).forEach((point, index) => {
    const previous = points[index]!;
    expect(point.x === previous.x || point.y === previous.y).toBe(true);
  });
}

function calculate(
  overrides: Partial<Parameters<PlacementEngine["calculate"]>[0]> = {},
): ScenePresentationPosition {
  return new PlacementEngine().calculate({
    placementId: "placement.near-target",
    target: { left: 100, top: 120, width: 200, height: 80 },
    viewport: { width: 1_200, height: 800 },
    ...overrides,
  });
}

function assertSafePlacement(
  placement: ScenePresentationPosition,
  target: TargetGeometry,
  viewport: { width: number; height: number },
  guideSize = { width: 300, height: 180 },
): void {
  const guide = rectForGuide(placement, guideSize);
  assertNoOverlap(guide, target);
  expect(isInsideViewport(guide, viewport)).toBe(true);
  if (!placement.companionSuppressed) {
    const companion = rectForCompanion(placement);
    assertNoOverlap(companion, target);
    assertNoOverlap(companion, guide);
    expect(isInsideViewport(companion, viewport)).toBe(true);
  }
}

function rectForCompanion(placement: ScenePresentationPosition): TargetGeometry {
  return {
    left: placement.left + placement.companionOffsetLeft,
    top: placement.top + placement.companionOffsetTop,
    width: 112,
    height: 112,
  };
}

function rectForGuide(
  placement: ScenePresentationPosition,
  size = { width: 300, height: 180 },
): TargetGeometry {
  return {
    left: placement.left + placement.guideOffsetLeft,
    top: placement.top + placement.guideOffsetTop,
    ...size,
  };
}

function isInsideViewport(
  value: TargetGeometry,
  viewport: { width: number; height: number },
): boolean {
  return (
    value.left >= 16 &&
    value.top >= 16 &&
    value.left + value.width <= viewport.width - 16 &&
    value.top + value.height <= viewport.height - 16
  );
}

function assertNoOverlap(left: TargetGeometry, right: TargetGeometry): void {
  const width = Math.max(
    0,
    Math.min(left.left + left.width, right.left + right.width) -
      Math.max(left.left, right.left),
  );
  const height = Math.max(
    0,
    Math.min(left.top + left.height, right.top + right.height) -
      Math.max(left.top, right.top),
  );
  expect(width * height).toBe(0);
}
