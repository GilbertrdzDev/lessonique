export const DEFAULT_LOWER_PANEL_RATIO = 0.38;
export const MINIMUM_LOWER_PANEL_RATIO = 0.28;
export const MAXIMUM_LOWER_PANEL_RATIO = 0.58;
export const MINIMUM_EDITOR_PANEL_HEIGHT = 144;
export const MINIMUM_LOWER_PANEL_HEIGHT = 104;
export const LOWER_PANEL_SEPARATOR_HEIGHT = 12;

export type VerticalPanelRatioBounds = Readonly<{
  minimum: number;
  maximum: number;
}>;

export function getVerticalPanelRatioBounds(
  containerHeight: number,
): VerticalPanelRatioBounds {
  const availableHeight = Math.max(
    1,
    containerHeight - LOWER_PANEL_SEPARATOR_HEIGHT,
  );
  const minimum = Math.max(
    MINIMUM_LOWER_PANEL_RATIO,
    MINIMUM_LOWER_PANEL_HEIGHT / availableHeight,
  );
  const maximum = Math.min(
    MAXIMUM_LOWER_PANEL_RATIO,
    1 - MINIMUM_EDITOR_PANEL_HEIGHT / availableHeight,
  );

  if (minimum <= maximum) {
    return { minimum, maximum };
  }

  const constrainedRatio =
    MINIMUM_LOWER_PANEL_HEIGHT /
    (MINIMUM_EDITOR_PANEL_HEIGHT + MINIMUM_LOWER_PANEL_HEIGHT);
  return { minimum: constrainedRatio, maximum: constrainedRatio };
}

export function clampVerticalPanelRatio(
  ratio: number,
  containerHeight: number,
): number {
  const bounds = getVerticalPanelRatioBounds(containerHeight);
  return Math.min(bounds.maximum, Math.max(bounds.minimum, ratio));
}

export function getVerticalPanelRatioFromPointer(input: Readonly<{
  clientY: number;
  containerTop: number;
  containerHeight: number;
  pointerOffsetY?: number;
}>): number {
  const availableHeight = Math.max(
    1,
    input.containerHeight - LOWER_PANEL_SEPARATOR_HEIGHT,
  );
  const separatorCenter = input.clientY - (input.pointerOffsetY ?? 0);
  const lowerPanelHeight =
    input.containerTop + input.containerHeight -
    separatorCenter -
    LOWER_PANEL_SEPARATOR_HEIGHT / 2;
  return clampVerticalPanelRatio(
    lowerPanelHeight / availableHeight,
    input.containerHeight,
  );
}
