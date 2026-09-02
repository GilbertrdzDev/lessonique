export type ConstructionPetSpriteConfig = Readonly<{
  cellHeight: number;
  cellWidth: number;
  columns: number;
  frameCount: number;
  frameDurationsMs: readonly number[];
  rows: number;
  spriteSrc: string;
  staticFrame: number;
}>;

export const CONSTRUCTION_PET_16_FRAME_DURATIONS_MS = [
  520, 170, 150, 140,
  130, 120, 85, 170,
  210, 120, 150, 170,
  190, 220, 280, 420,
] as const;

export const CONSTRUCTION_PET_16_FRAME_CONFIG = {
  cellHeight: 320,
  cellWidth: 362,
  columns: 4,
  frameCount: CONSTRUCTION_PET_16_FRAME_DURATIONS_MS.length,
  frameDurationsMs: CONSTRUCTION_PET_16_FRAME_DURATIONS_MS,
  rows: 4,
  spriteSrc: "/images/companion/construction-pet-sprite.webp",
  staticFrame: 0,
} as const satisfies ConstructionPetSpriteConfig;

export const CONSTRUCTION_PET_32_FRAME_DURATIONS_MS = [
  300, 160, 160, 200,
  110, 100, 95, 90, 85, 80, 75,
  90, 110, 130, 140,
  70, 60, 50, 45, 40,
  80, 120,
  70, 80, 90, 110,
  120, 130, 145, 160,
  220, 360,
] as const;

export const CONSTRUCTION_PET_32_FRAME_CONFIG = {
  cellHeight: 320,
  cellWidth: 362,
  columns: 8,
  frameCount: CONSTRUCTION_PET_32_FRAME_DURATIONS_MS.length,
  frameDurationsMs: CONSTRUCTION_PET_32_FRAME_DURATIONS_MS,
  rows: 4,
  spriteSrc: "/images/companion/construction-pet-sprite-32f.webp",
  staticFrame: 0,
} as const satisfies ConstructionPetSpriteConfig;

export const CONSTRUCTION_PET_CONFIG = CONSTRUCTION_PET_32_FRAME_CONFIG;
export const CONSTRUCTION_PET_FRAME_DURATIONS_MS =
  CONSTRUCTION_PET_32_FRAME_DURATIONS_MS;
export const CONSTRUCTION_PET_FRAME_COUNT = CONSTRUCTION_PET_CONFIG.frameCount;
export const CONSTRUCTION_PET_SPRITE_SRC = CONSTRUCTION_PET_CONFIG.spriteSrc;
export const CONSTRUCTION_PET_STATIC_FRAME = CONSTRUCTION_PET_CONFIG.staticFrame;
