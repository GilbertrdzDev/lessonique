import type { TargetGeometry } from "@/core/workspace/targeting";

import type {
  ScenePresentationFacing,
  ScenePresentationPosition,
  ScenePresentationSide,
} from "./store";

const DEFAULT_ASSISTANT_SIZE = { width: 112, height: 112 };
const DEFAULT_GUIDE_SIZE = { width: 300, height: 180 };
const DEFAULT_MARGIN = 16;
const GUIDE_GAP = 16;

export interface PlacementViewport {
  width: number;
  height: number;
}

export interface PlacementRequest {
  placementId?: string;
  target?: TargetGeometry;
  viewport: PlacementViewport;
  assistantSize?: { width: number; height: number };
  guideSize?: { width: number; height: number };
  obstructions?: readonly TargetGeometry[];
  margin?: number;
}

type PlacementCandidate = {
  left: number;
  top: number;
  side: Exclude<ScenePresentationSide, "docked">;
  order: number;
};

export class PlacementEngine {
  calculate(request: PlacementRequest): ScenePresentationPosition {
    const assistant = request.assistantSize ?? DEFAULT_ASSISTANT_SIZE;
    const guide = request.guideSize ?? DEFAULT_GUIDE_SIZE;
    const margin = request.margin ?? DEFAULT_MARGIN;
    const guideGap = guide.width > 0 ? GUIDE_GAP : 0;
    const combinedWidth = assistant.width + guideGap + guide.width;
    const combinedHeight = Math.max(assistant.height, guide.height);
    const target = request.target;
    const obstructions = request.obstructions ?? [];

    if (!target || request.placementId === "placement.floating") {
      return this.#calculateDocked({
        assistant,
        combinedHeight,
        combinedWidth,
        guide,
        guideGap,
        margin,
        obstructions,
        target,
        viewport: request.viewport,
      });
    }

    const targetCenterX = target.left + target.width / 2;
    const targetCenterY = target.top + target.height / 2;
    const centeredLeft = targetCenterX - combinedWidth / 2;
    const centeredTop = targetCenterY - combinedHeight / 2;
    const candidates: PlacementCandidate[] = [
      { left: target.left + target.width + margin, top: centeredTop, side: "right", order: 0 },
      { left: target.left - combinedWidth - margin, top: centeredTop, side: "left", order: 1 },
      { left: centeredLeft, top: target.top - combinedHeight - margin, side: "above", order: 2 },
      { left: centeredLeft, top: target.top + target.height + margin, side: "below", order: 3 },
      { left: target.left + target.width + margin, top: target.top, side: "right", order: 4 },
      {
        left: target.left + target.width + margin,
        top: target.top + target.height - combinedHeight,
        side: "right",
        order: 5,
      },
      { left: target.left - combinedWidth - margin, top: target.top, side: "left", order: 6 },
      {
        left: target.left - combinedWidth - margin,
        top: target.top + target.height - combinedHeight,
        side: "left",
        order: 7,
      },
    ];

    const resolved = candidates
      .map((candidate) => ({
        candidate,
        score: scoreCandidate({
          candidate,
          assistant,
          combinedHeight,
          combinedWidth,
          guide,
          guideGap,
          margin,
          obstructions,
          target,
          viewport: request.viewport,
        }),
      }))
      .filter(({ score }) => Number.isFinite(score))
      .sort((left, right) => left.score - right.score)[0]?.candidate;

    if (!resolved) {
      return this.#calculateDocked({
        assistant,
        combinedHeight,
        combinedWidth,
        guide,
        guideGap,
        margin,
        obstructions,
        target,
        viewport: request.viewport,
      });
    }

    const facing = facingForCandidate(resolved.side, target, resolved.left, combinedWidth);
    return createPosition({
      left: resolved.left,
      top: resolved.top,
      side: resolved.side,
      facing,
      docked: false,
      assistant,
      guide,
      guideGap,
      combinedHeight,
    });
  }

  #calculateDocked({
    assistant,
    combinedHeight,
    combinedWidth,
    guide,
    guideGap,
    margin,
    obstructions,
    target,
    viewport,
  }: {
    assistant: { width: number; height: number };
    combinedHeight: number;
    combinedWidth: number;
    guide: { width: number; height: number };
    guideGap: number;
    margin: number;
    obstructions: readonly TargetGeometry[];
    target?: TargetGeometry;
    viewport: PlacementViewport;
  }): ScenePresentationPosition {
    const maximumLeft = Math.max(margin, viewport.width - combinedWidth - margin);
    const maximumTop = Math.max(margin, viewport.height - combinedHeight - margin);
    const corners = [
      { left: maximumLeft, top: margin },
      { left: margin, top: margin },
      { left: maximumLeft, top: maximumTop },
      { left: margin, top: maximumTop },
    ];
    const selected = corners
      .map((corner, order) => ({
        corner,
        score:
          obstructionOverlapArea(
            rect(corner.left, corner.top, combinedWidth, combinedHeight),
            obstructions,
          ) * 10_000 +
          (target
            ? -rectDistance(rect(corner.left, corner.top, combinedWidth, combinedHeight), target)
            : order === 0
              ? 0
              : order * 10),
      }))
      .sort((left, right) => left.score - right.score)[0]!.corner;
    const facing = target ? facingTowardTarget(target, selected.left, combinedWidth) : "left";
    return createPosition({
      left: selected.left,
      top: selected.top,
      side: "docked",
      facing,
      docked: true,
      assistant,
      guide,
      guideGap,
      combinedHeight,
    });
  }
}

export type PointerPoint = { x: number; y: number };

export function calculatePointerPath({
  assistant,
  guide,
  target,
}: {
  assistant: TargetGeometry;
  guide?: TargetGeometry;
  target: TargetGeometry;
}): readonly PointerPoint[] {
  const assistantCenter = centerOf(assistant);
  const targetCenter = centerOf(target);
  const start = boundaryPoint(assistant, targetCenter);
  const end = boundaryPoint(target, assistantCenter);
  if (!guide || !segmentIntersectsRect(start, end, expandRect(guide, 8))) {
    return [start, end];
  }

  const expandedGuide = expandRect(guide, 10);
  const waypoints: PointerPoint[] = [
    { x: expandedGuide.left - 1, y: expandedGuide.top - 1 },
    { x: expandedGuide.left + expandedGuide.width + 1, y: expandedGuide.top - 1 },
    { x: expandedGuide.left - 1, y: expandedGuide.top + expandedGuide.height + 1 },
    {
      x: expandedGuide.left + expandedGuide.width + 1,
      y: expandedGuide.top + expandedGuide.height + 1,
    },
  ];
  const waypoint = waypoints
    .filter(
      (candidate) =>
        !segmentIntersectsRect(start, candidate, expandedGuide) &&
        !segmentIntersectsRect(candidate, end, expandedGuide),
    )
    .sort(
      (left, right) =>
        pointDistance(start, left) + pointDistance(left, end) -
        (pointDistance(start, right) + pointDistance(right, end)),
    )[0];
  return waypoint ? [start, waypoint, end] : [start, end];
}

function scoreCandidate({
  candidate,
  assistant,
  combinedHeight,
  combinedWidth,
  guide,
  guideGap,
  margin,
  obstructions,
  target,
  viewport,
}: {
  candidate: PlacementCandidate;
  assistant: { width: number; height: number };
  combinedHeight: number;
  combinedWidth: number;
  guide: { width: number; height: number };
  guideGap: number;
  margin: number;
  obstructions: readonly TargetGeometry[];
  target: TargetGeometry;
  viewport: PlacementViewport;
}): number {
  const groupRect = rect(candidate.left, candidate.top, combinedWidth, combinedHeight);
  if (!insideViewport(groupRect, viewport, margin) || overlapArea(groupRect, target) > 0) {
    return Number.POSITIVE_INFINITY;
  }
  const facing = facingForCandidate(candidate.side, target, candidate.left, combinedWidth);
  const position = createPosition({
    left: candidate.left,
    top: candidate.top,
    side: candidate.side,
    facing,
    docked: false,
    assistant,
    guide,
    guideGap,
    combinedHeight,
  });
  const assistantRect = rect(
    position.left + position.companionOffsetLeft,
    position.top + position.companionOffsetTop,
    assistant.width,
    assistant.height,
  );
  return (
    obstructionOverlapArea(groupRect, obstructions) * 10_000 +
    rectDistance(assistantRect, target) +
    candidate.order * 0.01
  );
}

function createPosition({
  left,
  top,
  side,
  facing,
  docked,
  assistant,
  guide,
  guideGap,
  combinedHeight,
}: {
  left: number;
  top: number;
  side: ScenePresentationSide;
  facing: ScenePresentationFacing;
  docked: boolean;
  assistant: { width: number; height: number };
  guide: { width: number; height: number };
  guideGap: number;
  combinedHeight: number;
}): ScenePresentationPosition {
  const companionAfterGuide = facing === "right" && guide.width > 0;
  return {
    left,
    top,
    side,
    facing,
    docked,
    companionOffsetLeft: companionAfterGuide ? guide.width + guideGap : 0,
    companionOffsetTop: (combinedHeight - assistant.height) / 2,
  };
}

function facingForCandidate(
  side: Exclude<ScenePresentationSide, "docked">,
  target: TargetGeometry,
  left: number,
  width: number,
): ScenePresentationFacing {
  if (side === "left") return "right";
  if (side === "right") return "left";
  return facingTowardTarget(target, left, width);
}

function facingTowardTarget(
  target: TargetGeometry,
  groupLeft: number,
  groupWidth: number,
): ScenePresentationFacing {
  const targetCenter = target.left + target.width / 2;
  const groupCenter = groupLeft + groupWidth / 2;
  return targetCenter < groupCenter ? "left" : "right";
}

function rect(left: number, top: number, width: number, height: number): TargetGeometry {
  return { left, top, width, height };
}

function insideViewport(value: TargetGeometry, viewport: PlacementViewport, margin: number): boolean {
  return (
    value.left >= margin &&
    value.top >= margin &&
    value.left + value.width <= viewport.width - margin &&
    value.top + value.height <= viewport.height - margin
  );
}

function overlapArea(left: TargetGeometry, right: TargetGeometry): number {
  const width = Math.max(
    0,
    Math.min(left.left + left.width, right.left + right.width) - Math.max(left.left, right.left),
  );
  const height = Math.max(
    0,
    Math.min(left.top + left.height, right.top + right.height) - Math.max(left.top, right.top),
  );
  return width * height;
}

function obstructionOverlapArea(value: TargetGeometry, obstructions: readonly TargetGeometry[]): number {
  return obstructions.reduce((total, obstruction) => total + overlapArea(value, obstruction), 0);
}

function rectDistance(left: TargetGeometry, right: TargetGeometry): number {
  return pointDistance(centerOf(left), centerOf(right));
}

function centerOf(value: TargetGeometry): PointerPoint {
  return { x: value.left + value.width / 2, y: value.top + value.height / 2 };
}

function boundaryPoint(value: TargetGeometry, toward: PointerPoint): PointerPoint {
  const center = centerOf(value);
  const deltaX = toward.x - center.x;
  const deltaY = toward.y - center.y;
  if (deltaX === 0 && deltaY === 0) return center;
  const scale = Math.min(
    deltaX === 0 ? Number.POSITIVE_INFINITY : value.width / 2 / Math.abs(deltaX),
    deltaY === 0 ? Number.POSITIVE_INFINITY : value.height / 2 / Math.abs(deltaY),
  );
  return { x: center.x + deltaX * scale, y: center.y + deltaY * scale };
}

function expandRect(value: TargetGeometry, amount: number): TargetGeometry {
  return {
    left: value.left - amount,
    top: value.top - amount,
    width: value.width + amount * 2,
    height: value.height + amount * 2,
  };
}

function segmentIntersectsRect(start: PointerPoint, end: PointerPoint, value: TargetGeometry): boolean {
  if (pointInsideRect(start, value) || pointInsideRect(end, value)) return true;
  const right = value.left + value.width;
  const bottom = value.top + value.height;
  return [
    [{ x: value.left, y: value.top }, { x: right, y: value.top }],
    [{ x: right, y: value.top }, { x: right, y: bottom }],
    [{ x: right, y: bottom }, { x: value.left, y: bottom }],
    [{ x: value.left, y: bottom }, { x: value.left, y: value.top }],
  ].some(([edgeStart, edgeEnd]) => segmentsIntersect(start, end, edgeStart!, edgeEnd!));
}

function pointInsideRect(point: PointerPoint, value: TargetGeometry): boolean {
  return (
    point.x >= value.left &&
    point.x <= value.left + value.width &&
    point.y >= value.top &&
    point.y <= value.top + value.height
  );
}

function segmentsIntersect(
  firstStart: PointerPoint,
  firstEnd: PointerPoint,
  secondStart: PointerPoint,
  secondEnd: PointerPoint,
): boolean {
  const direction = (start: PointerPoint, end: PointerPoint, point: PointerPoint) =>
    (point.x - start.x) * (end.y - start.y) -
    (point.y - start.y) * (end.x - start.x);
  const d1 = direction(firstStart, firstEnd, secondStart);
  const d2 = direction(firstStart, firstEnd, secondEnd);
  const d3 = direction(secondStart, secondEnd, firstStart);
  const d4 = direction(secondStart, secondEnd, firstEnd);
  return d1 * d2 <= 0 && d3 * d4 <= 0;
}

function pointDistance(left: PointerPoint, right: PointerPoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}
