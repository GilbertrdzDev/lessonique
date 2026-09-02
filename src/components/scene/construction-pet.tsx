"use client";

import { useEffect, useRef, type CSSProperties } from "react";

import { SpriteSheetAnimator } from "@/core/animation/sprite-sheet-animator";
import { cn } from "@/lib/utils";

import {
  CONSTRUCTION_PET_CONFIG,
  type ConstructionPetSpriteConfig,
} from "./construction-pet-config";
import styles from "./construction-pet.module.css";

export {
  CONSTRUCTION_PET_16_FRAME_CONFIG,
  CONSTRUCTION_PET_16_FRAME_DURATIONS_MS,
  CONSTRUCTION_PET_32_FRAME_CONFIG,
  CONSTRUCTION_PET_32_FRAME_DURATIONS_MS,
  CONSTRUCTION_PET_CONFIG,
  CONSTRUCTION_PET_FRAME_COUNT,
  CONSTRUCTION_PET_FRAME_DURATIONS_MS,
  CONSTRUCTION_PET_SPRITE_SRC,
  CONSTRUCTION_PET_STATIC_FRAME,
} from "./construction-pet-config";
export type { ConstructionPetSpriteConfig } from "./construction-pet-config";

export type ConstructionPetStep = 1 | 2 | 3;

type ConstructionPetProps = Readonly<{
  builderStep: ConstructionPetStep;
  className?: string;
  reducedMotion: boolean;
  spriteConfig?: ConstructionPetSpriteConfig;
}>;

type SpriteFrameStyle = CSSProperties & {
  "--construction-frame-x": string;
  "--construction-frame-y": string;
  "--construction-sheet-height": string;
  "--construction-sheet-width": string;
  "--construction-sprite-url": string;
};

const preloadedSprites = new Map<string, HTMLImageElement>();

export function preloadConstructionPetSprite(
  spriteConfig: ConstructionPetSpriteConfig = CONSTRUCTION_PET_CONFIG,
): void {
  if (
    typeof window === "undefined" ||
    preloadedSprites.has(spriteConfig.spriteSrc)
  ) {
    return;
  }
  const sprite = new window.Image();
  sprite.decoding = "async";
  sprite.src = spriteConfig.spriteSrc;
  preloadedSprites.set(spriteConfig.spriteSrc, sprite);
}

export function ConstructionPet({
  builderStep,
  className,
  reducedMotion,
  spriteConfig = CONSTRUCTION_PET_CONFIG,
}: ConstructionPetProps) {
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const showFrame = (frameIndex: number) => {
      const column = frameIndex % spriteConfig.columns;
      const row = Math.floor(frameIndex / spriteConfig.columns);
      root.style.setProperty(
        "--construction-frame-x",
        `${column * (100 / (spriteConfig.columns - 1))}%`,
      );
      root.style.setProperty(
        "--construction-frame-y",
        `${row * (100 / (spriteConfig.rows - 1))}%`,
      );
      root.dataset.spriteFrame = String(frameIndex);
    };

    if (reducedMotion) {
      showFrame(spriteConfig.staticFrame);
      return;
    }

    const animator = new SpriteSheetAnimator({
      frameDurationsMs: spriteConfig.frameDurationsMs,
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
  }, [reducedMotion, spriteConfig]);

  return (
    <span
      aria-hidden="true"
      className={cn(styles.root, className)}
      data-animation-mode={reducedMotion ? "static" : "loop"}
      data-builder-step={builderStep}
      data-frame-count={spriteConfig.frameCount}
      data-slot="construction-pet"
      data-sprite-frame={spriteConfig.staticFrame}
      ref={rootRef}
      style={
        {
          "--construction-frame-x": "0%",
          "--construction-frame-y": "0%",
          "--construction-sheet-height": `${spriteConfig.rows * 100}%`,
          "--construction-sheet-width": `${spriteConfig.columns * 100}%`,
          "--construction-sprite-url": `url("${spriteConfig.spriteSrc}")`,
        } as SpriteFrameStyle
      }
    />
  );
}
