import type { TargetGeometry, TargetRectangle } from "@/core/workspace/targeting";

import type {
  ScenePresentationFacing,
  ScenePresentationPosition,
  ScenePresentationSide,
} from "./store";

export const GUIDANCE_LAYOUT_CONFIG = Object.freeze({
  safeMargin: 16,
  targetGap: 16,
  elementGap: 12,
  obstructionPenalty: 100_000,
});

const DEFAULT_ASSISTANT_SIZE = { width: 112, height: 112 };
const DEFAULT_GUIDE_SIZE = { width: 300, height: 180 };

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

type ElementPlacement = {
  left: number;
  top: number;
  order: number;
  docked?: boolean;
};

type PlacementCandidate = {
  assistant: ElementPlacement;
  guide?: ElementPlacement;
  side: Exclude<ScenePresentationSide, "docked">;
  guideAdjacent?: boolean;
  companionSuppressed?: boolean;
  guideSuppressed?: boolean;
};

export class PlacementEngine {
  calculate(request: PlacementRequest): ScenePresentationPosition {
    const assistantSize = request.assistantSize ?? DEFAULT_ASSISTANT_SIZE;
    const guideSize = request.guideSize ?? DEFAULT_GUIDE_SIZE;
    const margin = request.margin ?? GUIDANCE_LAYOUT_CONFIG.safeMargin;
    const obstructions = request.obstructions ?? [];
    const target = request.target;
    const candidates = target && request.placementId !== "placement.floating"
      ? createTargetCandidates(
          target,
          assistantSize,
          guideSize,
          request.viewport,
          margin,
          obstructions,
        )
      : createFloatingCandidates(assistantSize, guideSize, request.viewport, margin);
    const selected = candidates
      .map((candidate) => ({
        candidate,
        score: scoreCandidate({
          candidate,
          assistantSize,
          guideSize,
          margin,
          obstructions,
          target,
          viewport: request.viewport,
        }),
      }))
      .filter(({ score }) => Number.isFinite(score))
      .sort((left, right) => left.score - right.score)[0]?.candidate ??
      createEmergencyCandidate(assistantSize, guideSize, request.viewport, margin, target);

    return toPresentationPosition(selected, assistantSize, guideSize, target);
  }
}

function createTargetCandidates(
  target: TargetGeometry,
  assistantSize: { width: number; height: number },
  guideSize: { width: number; height: number },
  viewport: PlacementViewport,
  margin: number,
  obstructions: readonly TargetGeometry[],
): PlacementCandidate[] {
  const gap = GUIDANCE_LAYOUT_CONFIG.targetGap;
  const centerX = target.left + target.width / 2;
  const centerY = target.top + target.height / 2;
  const assistants: Array<
    ElementPlacement & { side: Exclude<ScenePresentationSide, "docked"> }
  > = [
    { left: target.left + target.width + gap, top: centerY - assistantSize.height / 2, side: "right", order: 0 },
    { left: target.left - assistantSize.width - gap, top: centerY - assistantSize.height / 2, side: "left", order: 1 },
    { left: centerX - assistantSize.width / 2, top: target.top - assistantSize.height - gap, side: "above", order: 2 },
    { left: centerX - assistantSize.width / 2, top: target.top + target.height + gap, side: "below", order: 3 },
    { left: target.left + target.width + gap, top: target.top - assistantSize.height - gap, side: "right", order: 4 },
    { left: target.left - assistantSize.width - gap, top: target.top - assistantSize.height - gap, side: "left", order: 5 },
    { left: target.left + target.width + gap, top: target.top + target.height + gap, side: "right", order: 6 },
    { left: target.left - assistantSize.width - gap, top: target.top + target.height + gap, side: "left", order: 7 },
  ];
  const guides = guideSize.width > 0 && guideSize.height > 0
    ? createGuideCandidates(target, guideSize, viewport, margin, obstructions)
    : [undefined];
  const guideAdjacentCandidates = guides.flatMap((guide) =>
    guide
      ? [createGuideAdjacentCandidate(target, assistantSize, guideSize, guide)]
      : [],
  );
  const independentCandidates = assistants.flatMap((assistant) =>
    guides.map((guide) => ({ assistant, guide, side: assistant.side })),
  );
  return [...guideAdjacentCandidates, ...independentCandidates];
}

function createGuideAdjacentCandidate(
  target: TargetGeometry,
  assistantSize: { width: number; height: number },
  guideSize: { width: number; height: number },
  guide: ElementPlacement,
): PlacementCandidate {
  const gap = GUIDANCE_LAYOUT_CONFIG.elementGap;
  const targetCenter = centerOf(target);
  const guideCenter = {
    x: guide.left + guideSize.width / 2,
    y: guide.top + guideSize.height / 2,
  };
  const deltaX = guideCenter.x - targetCenter.x;
  const deltaY = guideCenter.y - targetCenter.y;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    const guideIsRight = deltaX >= 0;
    return {
      assistant: {
        left: guideIsRight
          ? guide.left + guideSize.width + gap
          : guide.left - assistantSize.width - gap,
        top: guide.top + (guideSize.height - assistantSize.height) / 2,
        order: guide.order,
      },
      guide,
      guideAdjacent: true,
      side: guideIsRight ? "right" : "left",
    };
  }

  const guideIsBelow = deltaY >= 0;
  return {
    assistant: {
      left: guide.left + (guideSize.width - assistantSize.width) / 2,
      top: guideIsBelow
        ? guide.top + guideSize.height + gap
        : guide.top - assistantSize.height - gap,
      order: guide.order,
    },
    guide,
    guideAdjacent: true,
    side: guideIsBelow ? "below" : "above",
  };
}

function createGuideCandidates(
  target: TargetGeometry,
  guideSize: { width: number; height: number },
  viewport: PlacementViewport,
  margin: number,
  obstructions: readonly TargetGeometry[],
): ElementPlacement[] {
  const gap = GUIDANCE_LAYOUT_CONFIG.targetGap;
  const centerX = target.left + target.width / 2;
  const centerY = target.top + target.height / 2;
  const maximumLeft = viewport.width - guideSize.width - margin;
  const maximumTop = viewport.height - guideSize.height - margin;
  const candidates: ElementPlacement[] = [
    { left: target.left + target.width + gap, top: centerY - guideSize.height / 2, order: 0 },
    { left: target.left - guideSize.width - gap, top: centerY - guideSize.height / 2, order: 1 },
    { left: centerX - guideSize.width / 2, top: target.top - guideSize.height - gap, order: 2 },
    { left: centerX - guideSize.width / 2, top: target.top + target.height + gap, order: 3 },
    { left: margin, top: margin, order: 8, docked: true },
    { left: maximumLeft, top: margin, order: 9, docked: true },
    { left: margin, top: maximumTop, order: 10, docked: true },
    { left: maximumLeft, top: maximumTop, order: 11, docked: true },
  ];
  const horizontalAnchors = [
    target.left + target.width + gap,
    target.left - guideSize.width - gap,
    centerX - guideSize.width / 2,
  ];
  const verticalAnchors = [
    target.top,
    target.top + target.height - guideSize.height,
    centerY - guideSize.height / 2,
  ];
  obstructions.forEach((obstruction, obstructionIndex) => {
    const order = 20 + obstructionIndex * 8;
    horizontalAnchors.forEach((left, anchorIndex) => {
      candidates.push(
        {
          left,
          top: obstruction.top + obstruction.height + GUIDANCE_LAYOUT_CONFIG.elementGap,
          order: order + anchorIndex,
        },
        {
          left,
          top: obstruction.top - guideSize.height - GUIDANCE_LAYOUT_CONFIG.elementGap,
          order: order + anchorIndex + 3,
        },
        {
          left,
          top: obstruction.top + obstruction.height + 1,
          order: order + anchorIndex + 6,
        },
        {
          left,
          top: obstruction.top - guideSize.height - 1,
          order: order + anchorIndex + 9,
        },
      );
    });
    verticalAnchors.forEach((top, anchorIndex) => {
      candidates.push(
        {
          left: obstruction.left + obstruction.width + GUIDANCE_LAYOUT_CONFIG.elementGap,
          top,
          order: order + anchorIndex,
        },
        {
          left: obstruction.left - guideSize.width - GUIDANCE_LAYOUT_CONFIG.elementGap,
          top,
          order: order + anchorIndex + 3,
        },
        {
          left: obstruction.left + obstruction.width + 1,
          top,
          order: order + anchorIndex + 6,
        },
        {
          left: obstruction.left - guideSize.width - 1,
          top,
          order: order + anchorIndex + 9,
        },
      );
    });
  });
  return candidates;
}

function createFloatingCandidates(
  assistantSize: { width: number; height: number },
  guideSize: { width: number; height: number },
  viewport: PlacementViewport,
  margin: number,
): PlacementCandidate[] {
  const gap = guideSize.width > 0 ? GUIDANCE_LAYOUT_CONFIG.elementGap : 0;
  const width = assistantSize.width + gap + guideSize.width;
  const height = Math.max(assistantSize.height, guideSize.height);
  const anchors = [
    { left: viewport.width - width - margin, top: margin },
    { left: margin, top: margin },
    { left: viewport.width - width - margin, top: viewport.height - height - margin },
    { left: margin, top: viewport.height - height - margin },
  ];
  return anchors.flatMap((anchor, order) => [
    {
      assistant: { left: anchor.left, top: anchor.top + (height - assistantSize.height) / 2, order },
      guide: guideSize.width > 0
        ? { left: anchor.left + assistantSize.width + gap, top: anchor.top + (height - guideSize.height) / 2, order, docked: true }
        : undefined,
      side: "right" as const,
    },
    {
      assistant: { left: anchor.left + guideSize.width + gap, top: anchor.top + (height - assistantSize.height) / 2, order: order + 4 },
      guide: guideSize.width > 0
        ? { left: anchor.left, top: anchor.top + (height - guideSize.height) / 2, order: order + 4, docked: true }
        : undefined,
      side: "left" as const,
    },
  ]);
}

function createEmergencyCandidate(
  assistantSize: { width: number; height: number },
  guideSize: { width: number; height: number },
  viewport: PlacementViewport,
  margin: number,
  target?: TargetGeometry,
): PlacementCandidate {
  const guideCandidates = guideSize.width > 0
    ? [
        { left: margin, top: margin },
        { left: viewport.width - guideSize.width - margin, top: margin },
        { left: margin, top: viewport.height - guideSize.height - margin },
        { left: viewport.width - guideSize.width - margin, top: viewport.height - guideSize.height - margin },
      ]
    : [];
  const guideAnchor = guideCandidates
    .filter((candidate) =>
      !target || overlapArea(rect(candidate.left, candidate.top, guideSize.width, guideSize.height), target) === 0,
    )
    .sort((left, right) =>
      target
        ? rectDistance(rect(right.left, right.top, guideSize.width, guideSize.height), target) -
          rectDistance(rect(left.left, left.top, guideSize.width, guideSize.height), target)
        : 0,
    )[0] ?? guideCandidates[0];
  const guide = guideAnchor
    ? {
        left: clamp(guideAnchor.left, margin, viewport.width - guideSize.width - margin),
        top: clamp(guideAnchor.top, margin, viewport.height - guideSize.height - margin),
        order: 99,
        docked: true,
      }
    : undefined;
  const preferLeft = target
    ? target.left + target.width / 2 > viewport.width / 2
    : false;
  return {
    assistant: {
      left: preferLeft ? margin : viewport.width - assistantSize.width - margin,
      top: margin,
      order: 99,
      docked: true,
    },
    guide,
    side: preferLeft ? "left" : "right",
    companionSuppressed: true,
    guideSuppressed: true,
  };
}

function scoreCandidate({
  candidate,
  assistantSize,
  guideSize,
  margin,
  obstructions,
  target,
  viewport,
}: {
  candidate: PlacementCandidate;
  assistantSize: { width: number; height: number };
  guideSize: { width: number; height: number };
  margin: number;
  obstructions: readonly TargetGeometry[];
  target?: TargetGeometry;
  viewport: PlacementViewport;
}): number {
  const assistantRect = rect(
    candidate.assistant.left,
    candidate.assistant.top,
    assistantSize.width,
    assistantSize.height,
  );
  const guideRect = candidate.guide
    ? rect(candidate.guide.left, candidate.guide.top, guideSize.width, guideSize.height)
    : undefined;
  const protectedTarget = target
    ? expandRect(target, GUIDANCE_LAYOUT_CONFIG.targetGap)
    : undefined;
  if (!insideViewport(assistantRect, viewport, margin)) return Number.POSITIVE_INFINITY;
  if (guideRect && !insideViewport(guideRect, viewport, margin)) return Number.POSITIVE_INFINITY;
  if (protectedTarget && overlapArea(assistantRect, protectedTarget) > 0) {
    return Number.POSITIVE_INFINITY;
  }
  if (protectedTarget && guideRect && overlapArea(guideRect, protectedTarget) > 0) {
    return Number.POSITIVE_INFINITY;
  }
  if (guideRect && overlapArea(assistantRect, guideRect) > 0) return Number.POSITIVE_INFINITY;

  const obstructionOverlap =
    obstructionOverlapArea(assistantRect, obstructions) +
    (guideRect ? obstructionOverlapArea(guideRect, obstructions) : 0);
  const compositionPenalty = guideRect && !candidate.guideAdjacent ? 10_000 : 0;
  return (
    obstructionOverlap * GUIDANCE_LAYOUT_CONFIG.obstructionPenalty +
    compositionPenalty +
    (target ? rectDistance(assistantRect, target) : 0) +
    (target && guideRect ? rectDistance(guideRect, target) * 0.2 : 0) +
    candidate.assistant.order * 0.1 +
    (candidate.guide?.order ?? 0) * 0.01
  );
}

function toPresentationPosition(
  candidate: PlacementCandidate,
  assistantSize: { width: number; height: number },
  guideSize: { width: number; height: number },
  target?: TargetGeometry,
): ScenePresentationPosition {
  const guide = candidate.guide;
  const left = Math.min(candidate.assistant.left, guide?.left ?? candidate.assistant.left);
  const top = Math.min(candidate.assistant.top, guide?.top ?? candidate.assistant.top);
  const facing = target
    ? facingTowardTarget(target, candidate.assistant.left, assistantSize.width)
    : candidate.side === "left"
      ? "right"
      : "left";
  return {
    left,
    top,
    side: guide?.docked ? "docked" : candidate.side,
    facing,
    docked: Boolean(guide?.docked || candidate.assistant.docked),
    companionOffsetLeft: candidate.assistant.left - left,
    companionOffsetTop: candidate.assistant.top - top,
    guideOffsetLeft: (guide?.left ?? left) - left,
    guideOffsetTop: (guide?.top ?? top) - top,
    companionSuppressed: Boolean(candidate.companionSuppressed),
    guideSuppressed: Boolean(candidate.guideSuppressed),
  };
}

export type PointerPoint = { x: number; y: number };

export function createRoundedConnectorPath(
  points: readonly PointerPoint[],
  maximumRadius = 8,
): string {
  const first = points[0];
  if (!first) return "";
  if (points.length === 1) return `M ${first.x} ${first.y}`;

  const commands = [`M ${first.x} ${first.y}`];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!;
    const corner = points[index]!;
    const next = points[index + 1]!;
    const incomingLength = pointDistance(previous, corner);
    const outgoingLength = pointDistance(corner, next);
    const radius = Math.min(
      maximumRadius,
      incomingLength / 2,
      outgoingLength / 2,
    );
    if (radius === 0) {
      commands.push(`L ${corner.x} ${corner.y}`);
      continue;
    }
    const before = pointToward(corner, previous, radius);
    const after = pointToward(corner, next, radius);
    commands.push(
      `L ${before.x} ${before.y}`,
      `Q ${corner.x} ${corner.y} ${after.x} ${after.y}`,
    );
  }
  const last = points.at(-1)!;
  commands.push(`L ${last.x} ${last.y}`);
  return commands.join(" ");
}

export function calculatePointerPath({
  guide,
  target,
}: {
  guide: TargetGeometry;
  target: TargetGeometry;
}): readonly PointerPoint[] {
  const direction = nearestConnectorDirection(target, guide);
  const targetCenter = centerOf(target);
  const targetGap = 10;
  const channelLength = 14;

  if (direction === "right" || direction === "left") {
    const sign = direction === "right" ? 1 : -1;
    const targetEdge = direction === "right" ? target.left + target.width : target.left;
    const guideEdge = direction === "right" ? guide.left : guide.left + guide.width;
    const targetPoint = {
      x: targetEdge + sign * targetGap,
      y: targetCenter.y,
    };
    const guidePoint = {
      x: guideEdge,
      y: insetEdgeCoordinate(guide.top, guide.height, targetCenter.y),
    };
    const channelX = targetPoint.x +
      sign * Math.min(channelLength, Math.abs(guidePoint.x - targetPoint.x) / 2);
    return removeDuplicatePoints([
      targetPoint,
      { x: channelX, y: targetPoint.y },
      { x: channelX, y: guidePoint.y },
      guidePoint,
    ]);
  }

  const sign = direction === "bottom" ? 1 : -1;
  const targetEdge = direction === "bottom" ? target.top + target.height : target.top;
  const guideEdge = direction === "bottom" ? guide.top : guide.top + guide.height;
  const targetPoint = {
    x: targetCenter.x,
    y: targetEdge + sign * targetGap,
  };
  const guidePoint = {
    x: insetEdgeCoordinate(guide.left, guide.width, targetCenter.x),
    y: guideEdge,
  };
  const channelY = targetPoint.y +
    sign * Math.min(channelLength, Math.abs(guidePoint.y - targetPoint.y) / 2);
  return removeDuplicatePoints([
    targetPoint,
    { x: targetPoint.x, y: channelY },
    { x: guidePoint.x, y: channelY },
    guidePoint,
  ]);
}

type ConnectorDirection = "top" | "right" | "bottom" | "left";

function nearestConnectorDirection(
  target: TargetRectangle,
  guide: TargetRectangle,
): ConnectorDirection {
  const candidates: { direction: ConnectorDirection; gap: number }[] = [
    { direction: "right", gap: guide.left - (target.left + target.width) },
    { direction: "left", gap: target.left - (guide.left + guide.width) },
    { direction: "bottom", gap: guide.top - (target.top + target.height) },
    { direction: "top", gap: target.top - (guide.top + guide.height) },
  ];
  const separated = candidates
    .filter(({ gap }) => gap >= 0)
    .sort((left, right) => left.gap - right.gap)[0];
  if (separated) return separated.direction;

  const targetCenter = centerOf(target);
  const guideCenter = centerOf(guide);
  const deltaX = guideCenter.x - targetCenter.x;
  const deltaY = guideCenter.y - targetCenter.y;
  return Math.abs(deltaX) >= Math.abs(deltaY)
    ? deltaX >= 0
      ? "right"
      : "left"
    : deltaY >= 0
      ? "bottom"
      : "top";
}

function insetEdgeCoordinate(start: number, length: number, preferred: number): number {
  const inset = Math.min(22, length / 2);
  return Math.min(Math.max(preferred, start + inset), start + length - inset);
}

function removeDuplicatePoints(points: readonly PointerPoint[]): readonly PointerPoint[] {
  return points.filter(
    (point, index) =>
      index === 0 || point.x !== points[index - 1]!.x || point.y !== points[index - 1]!.y,
  );
}

function rect(left: number, top: number, width: number, height: number): TargetGeometry {
  return { left, top, width, height };
}

function insideViewport(value: TargetRectangle, viewport: PlacementViewport, margin: number): boolean {
  return (
    value.left >= margin &&
    value.top >= margin &&
    value.left + value.width <= viewport.width - margin &&
    value.top + value.height <= viewport.height - margin
  );
}

function overlapArea(left: TargetRectangle, right: TargetRectangle): number {
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
  return width * height;
}

function obstructionOverlapArea(
  value: TargetGeometry,
  obstructions: readonly TargetGeometry[],
): number {
  return obstructions.reduce(
    (total, obstruction) => total + overlapArea(value, obstruction),
    0,
  );
}

function rectDistance(left: TargetRectangle, right: TargetRectangle): number {
  return pointDistance(centerOf(left), centerOf(right));
}

function centerOf(value: TargetRectangle): PointerPoint {
  return { x: value.left + value.width / 2, y: value.top + value.height / 2 };
}

function pointToward(
  origin: PointerPoint,
  target: PointerPoint,
  distance: number,
): PointerPoint {
  const totalDistance = pointDistance(origin, target);
  if (totalDistance === 0) return origin;
  const ratio = distance / totalDistance;
  return {
    x: origin.x + (target.x - origin.x) * ratio,
    y: origin.y + (target.y - origin.y) * ratio,
  };
}

function expandRect(value: TargetRectangle, amount: number): TargetGeometry {
  return {
    left: value.left - amount,
    top: value.top - amount,
    width: value.width + amount * 2,
    height: value.height + amount * 2,
  };
}

function pointDistance(left: PointerPoint, right: PointerPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function facingTowardTarget(
  target: TargetRectangle,
  assistantLeft: number,
  assistantWidth: number,
): ScenePresentationFacing {
  const targetCenter = target.left + target.width / 2;
  const assistantCenter = assistantLeft + assistantWidth / 2;
  return targetCenter < assistantCenter ? "left" : "right";
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}
