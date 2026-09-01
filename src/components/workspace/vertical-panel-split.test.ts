import { describe, expect, it } from "vitest";

import {
  clampVerticalPanelRatio,
  getVerticalPanelRatioBounds,
  getVerticalPanelRatioFromPointer,
  MINIMUM_EDITOR_PANEL_HEIGHT,
  MINIMUM_LOWER_PANEL_HEIGHT,
} from "./vertical-panel-split";

describe("vertical panel split", () => {
  it("combines declared ratio bounds with concrete panel minimum heights", () => {
    expect(getVerticalPanelRatioBounds(600)).toEqual({
      minimum: 0.28,
      maximum: 0.58,
    });

    const compactBounds = getVerticalPanelRatioBounds(320);
    expect(compactBounds.minimum).toBeGreaterThan(0.33);
    expect(compactBounds.maximum).toBeLessThan(0.54);
    expect(
      (320 - 12) * compactBounds.minimum,
    ).toBeGreaterThanOrEqual(MINIMUM_LOWER_PANEL_HEIGHT);
    expect(
      (320 - 12) * (1 - compactBounds.maximum),
    ).toBeCloseTo(MINIMUM_EDITOR_PANEL_HEIGHT, 8);
  });

  it("derives the ratio from the separator center and preserves pointer offset", () => {
    expect(
      getVerticalPanelRatioFromPointer({
        clientY: 350,
        containerTop: 100,
        containerHeight: 500,
      }),
    ).toBeCloseTo(244 / 488, 5);
    expect(
      getVerticalPanelRatioFromPointer({
        clientY: 355,
        containerTop: 100,
        containerHeight: 500,
        pointerOffsetY: 5,
      }),
    ).toBeCloseTo(244 / 488, 5);
  });

  it("clamps impossible pointer positions without violating either panel minimum", () => {
    expect(clampVerticalPanelRatio(0, 600)).toBe(0.28);
    expect(clampVerticalPanelRatio(1, 600)).toBe(0.58);
  });
});
