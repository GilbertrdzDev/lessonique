"use client";

import { useEffect, useRef, type CSSProperties } from "react";

import { SpriteSheetAnimator } from "@/core/animation/sprite-sheet-animator";
import { cn } from "@/lib/utils";

import styles from "./construction-pet.module.css";

export const CONSTRUCTION_PET_SPRITE_SRC =
  "/images/companion/construction-pet-sprite.webp";
export const CONSTRUCTION_PET_FRAME_COUNT = 16;
export const CONSTRUCTION_PET_STATIC_FRAME = 0;
export const CONSTRUCTION_PET_FRAME_DURATIONS_MS = [
  520, 170, 150, 140,
  130, 120, 85, 170,
  210, 120, 150, 170,
  190, 220, 280, 420,
] as const;

export type ConstructionPetStep = 1 | 2 | 3;

type ConstructionPetProps = Readonly<{
  builderStep: ConstructionPetStep;
  className?: string;
  reducedMotion: boolean;
}>;

type SpriteFrameStyle = CSSProperties & {
  "--construction-frame-x": string;
  "--construction-frame-y": string;
};

let preloadedSprite: HTMLImageElement | undefined;

export function preloadConstructionPetSprite(): void {
  if (typeof window === "undefined" || preloadedSprite) return;
  preloadedSprite = new window.Image();
  preloadedSprite.decoding = "async";
  preloadedSprite.src = CONSTRUCTION_PET_SPRITE_SRC;
}

export function ConstructionPet({
  builderStep,
  className,
  reducedMotion,
}: ConstructionPetProps) {
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const showFrame = (frameIndex: number) => {
      const column = frameIndex % 4;
      const row = Math.floor(frameIndex / 4);
      root.style.setProperty(
        "--construction-frame-x",
        `${column * (100 / 3)}%`,
      );
      root.style.setProperty(
        "--construction-frame-y",
        `${row * (100 / 3)}%`,
      );
      root.dataset.spriteFrame = String(frameIndex);
    };

    if (reducedMotion) {
      showFrame(CONSTRUCTION_PET_STATIC_FRAME);
      return;
    }

    const animator = new SpriteSheetAnimator({
      frameDurationsMs: CONSTRUCTION_PET_FRAME_DURATIONS_MS,
      onFrame: showFrame,
    });
    const handleVisibilityChange = () => {
      if (document.hidden) {
        animator.pause();
      } else {
        animator.resume();
      }
    };

    animator.start();
    if (document.hidden) animator.pause();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      animator.stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [reducedMotion]);

  return (
    <span
      aria-hidden="true"
      className={cn(styles.root, className)}
      data-animation-mode={reducedMotion ? "static" : "loop"}
      data-builder-step={builderStep}
      data-frame-count={CONSTRUCTION_PET_FRAME_COUNT}
      data-slot="construction-pet"
      data-sprite-frame={CONSTRUCTION_PET_STATIC_FRAME}
      ref={rootRef}
      style={
        {
          "--construction-frame-x": "0%",
          "--construction-frame-y": "0%",
        } as SpriteFrameStyle
      }
    />
  );
}
