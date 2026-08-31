import type { TargetGeometry } from "@/core/workspace/targeting";

import type { ScenePresentationPosition } from "./store";

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
    const assistant = request.assistantSize ?? { width: 104, height: 112 };
    const guide = request.guideSize ?? { width: 300, height: 180 };
    const margin = request.margin ?? 16;
    const combinedHeight = Math.max(assistant.height, guide.height);
    const target = request.target;
    if (!target || request.placementId === "placement.floating") {
      return {
        left: clamp(
          request.viewport.width - assistant.width - margin,
          margin,
          request.viewport.width - assistant.width - margin,
        ),
        top: clamp(
          margin + 72,
          margin,
          request.viewport.height - combinedHeight - margin,
        ),
        docked: true,
      };
    }

    const combinedWidth = assistant.width + guide.width + margin;
    const maximumLeft = request.viewport.width - combinedWidth - margin;
    const maximumTop = request.viewport.height - combinedHeight - margin;
    const centeredTop = clamp(
      target.top + target.height / 2 - assistant.height / 2,
      margin,
      maximumTop,
    );
    const alignedLeft = clamp(target.left, margin, maximumLeft);
    const candidates = [
      {
        left: target.left + target.width + margin,
        top: centeredTop,
      },
      {
        left: target.left - combinedWidth - margin,
        top: centeredTop,
      },
      {
        left: alignedLeft,
        top: target.top - combinedHeight - margin,
      },
      {
        left: alignedLeft,
        top: target.top + target.height + margin,
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
      return {
        left: margin,
        top: Math.max(margin, request.viewport.height - combinedHeight - margin),
        docked: true,
      };
    }
    return {
      left: clamp(
        candidate.left,
        margin,
        maximumLeft,
      ),
      top: clamp(
        candidate.top,
        margin,
        maximumTop,
      ),
      docked: false,
    };
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}
