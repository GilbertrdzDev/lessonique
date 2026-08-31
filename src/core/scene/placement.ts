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
  margin?: number;
}

export class PlacementEngine {
  calculate(request: PlacementRequest): ScenePresentationPosition {
    const assistant = request.assistantSize ?? DEFAULT_ASSISTANT_SIZE;
    const guide = request.guideSize ?? DEFAULT_GUIDE_SIZE;
    const margin = request.margin ?? DEFAULT_MARGIN;
    const guideGap = guide.width > 0 ? GUIDE_GAP : 0;
    const combinedWidth = assistant.width + guideGap + guide.width;
    const combinedHeight = Math.max(assistant.height, guide.height);
    const target = request.target;
    if (!target || request.placementId === "placement.floating") {
      const left = clamp(
        request.viewport.width - combinedWidth - margin,
        margin,
        request.viewport.width - combinedWidth - margin,
      );
      const top = clamp(
          margin + 72,
          margin,
          request.viewport.height - combinedHeight - margin,
        );
      return createPosition({
        left,
        top,
        side: "docked",
        facing: target ? facingTowardTarget(target, left, combinedWidth) : "left",
        docked: true,
        assistant,
        guide,
        guideGap,
        combinedHeight,
      });
    }

    const maximumLeft = request.viewport.width - combinedWidth - margin;
    const maximumTop = request.viewport.height - combinedHeight - margin;
    const centeredTop = clamp(
      target.top + target.height / 2 - assistant.height / 2,
      margin,
      maximumTop,
    );
    const alignedLeft = clamp(target.left, margin, maximumLeft);
    const candidates: Array<{
      left: number;
      top: number;
      side: Exclude<ScenePresentationSide, "docked">;
    }> = [
      {
        left: target.left + target.width + margin,
        top: centeredTop,
        side: "right",
      },
      {
        left: target.left - combinedWidth - margin,
        top: centeredTop,
        side: "left",
      },
      {
        left: alignedLeft,
        top: target.top - combinedHeight - margin,
        side: "above",
      },
      {
        left: alignedLeft,
        top: target.top + target.height + margin,
        side: "below",
      },
    ];
    const candidate = candidates.find(
      ({ left, top }) =>
        left >= margin &&
        top >= margin &&
        left + combinedWidth <= request.viewport.width - margin &&
        top + combinedHeight <=
          request.viewport.height - margin,
    );
    if (!candidate) {
      const left = margin;
      const top = Math.max(margin, request.viewport.height - combinedHeight - margin);
      return createPosition({
        left,
        top,
        side: "docked",
        facing: facingTowardTarget(target, left, combinedWidth),
        docked: true,
        assistant,
        guide,
        guideGap,
        combinedHeight,
      });
    }
    const left = clamp(
        candidate.left,
        margin,
        maximumLeft,
      );
    const top = clamp(
        candidate.top,
        margin,
        maximumTop,
      );
    const facing =
      candidate.side === "left"
        ? "right"
        : candidate.side === "right"
          ? "left"
          : facingTowardTarget(target, left, combinedWidth);
    return createPosition({
      left,
      top,
      side: candidate.side,
      facing,
      docked: false,
      assistant,
      guide,
      guideGap,
      combinedHeight,
    });
  }
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
    companionOffsetTop: docked
      ? combinedHeight - assistant.height
      : (combinedHeight - assistant.height) / 2,
  };
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}
