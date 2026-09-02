import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CONSTRUCTION_PET_16_FRAME_CONFIG,
  CONSTRUCTION_PET_32_FRAME_CONFIG,
  CONSTRUCTION_PET_CONFIG,
  CONSTRUCTION_PET_FRAME_DURATIONS_MS,
  ConstructionPet,
} from "./construction-pet";

describe("ConstructionPet", () => {
  it("renders the approved 4-by-4 sprite surface by default", () => {
    const html = renderToStaticMarkup(
      <ConstructionPet builderStep={2} reducedMotion={false} />,
    );

    expect(html).toContain('data-slot="construction-pet"');
    expect(html).toContain('data-builder-step="2"');
    expect(html).toContain('data-frame-count="16"');
    expect(html).toContain('data-animation-mode="loop"');
    expect(html).not.toContain("<img");
    expect((html.match(/<span/gu) ?? [])).toHaveLength(1);
    expect(html).toContain("--construction-sheet-width:400%");
    expect(html).toContain("construction-pet-sprite.webp");
  });

  it("retains the 8-by-4 sprite for explicit reactivation", () => {
    const html = renderToStaticMarkup(
      <ConstructionPet
        builderStep={2}
        reducedMotion={false}
        spriteConfig={CONSTRUCTION_PET_32_FRAME_CONFIG}
      />,
    );

    expect(html).toContain('data-frame-count="32"');
    expect(html).toContain("--construction-sheet-width:800%");
    expect(html).toContain("construction-pet-sprite-32f.webp");
  });

  it("keeps reduced motion on the representative static frame", () => {
    const html = renderToStaticMarkup(
      <ConstructionPet builderStep={1} reducedMotion />,
    );

    expect(html).toContain('data-animation-mode="static"');
    expect(html).toContain('data-sprite-frame="0"');
  });

  it("declares the complete approved 16-frame timing cycle by default", () => {
    expect(CONSTRUCTION_PET_CONFIG.frameCount).toBe(16);
    expect(CONSTRUCTION_PET_FRAME_DURATIONS_MS).toHaveLength(16);
    expect(new Set(CONSTRUCTION_PET_FRAME_DURATIONS_MS).size).toBeGreaterThan(8);
    expect(CONSTRUCTION_PET_FRAME_DURATIONS_MS[0]).toBeGreaterThan(
      CONSTRUCTION_PET_FRAME_DURATIONS_MS[6],
    );
    expect(CONSTRUCTION_PET_FRAME_DURATIONS_MS[8]).toBeGreaterThan(
      CONSTRUCTION_PET_FRAME_DURATIONS_MS[6],
    );
    expect(
      CONSTRUCTION_PET_FRAME_DURATIONS_MS.reduce(
        (sum, value) => sum + value,
        0,
      ),
    ).toBe(3_245);
  });

  it("ships both bounded, cell-aligned WebP sprite presets", () => {
    assertSpriteAsset(CONSTRUCTION_PET_16_FRAME_CONFIG, {
      height: 1_280,
      maximumBytes: 850_000,
      width: 1_448,
    });
    assertSpriteAsset(CONSTRUCTION_PET_32_FRAME_CONFIG, {
      height: 1_280,
      maximumBytes: 1_700_000,
      width: 2_896,
    });
  });

  it("clips one responsive cell without interpolating neighboring frames", () => {
    const stylesheet = readFileSync(
      join(process.cwd(), "src", "components", "scene", "construction-pet.module.css"),
      "utf8",
    ).replace(/\s+/gu, " ");

    expect(stylesheet).toContain("aspect-ratio: 362 / 320");
    expect(stylesheet).toContain("overflow: hidden");
    expect(stylesheet).toContain("background-size: var(--construction-sheet-width) var(--construction-sheet-height)");
    expect(stylesheet).toContain("background-image: var(--construction-sprite-url)");
  });
});

function assertSpriteAsset(
  config: typeof CONSTRUCTION_PET_16_FRAME_CONFIG | typeof CONSTRUCTION_PET_32_FRAME_CONFIG,
  expected: Readonly<{ height: number; maximumBytes: number; width: number }>,
): void {
  const path = join(process.cwd(), "public", config.spriteSrc.slice(1));
  const bytes = readFileSync(path);
  const dimensions = readLosslessWebPDimensions(bytes);

  expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
  expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
  expect(dimensions).toEqual({ height: expected.height, width: expected.width });
  expect(dimensions.width / config.columns).toBe(config.cellWidth);
  expect(dimensions.height / config.rows).toBe(config.cellHeight);
  expect(statSync(path).size).toBeLessThan(expected.maximumBytes);
}

function readLosslessWebPDimensions(bytes: Buffer): {
  height: number;
  width: number;
} {
  const chunkType = bytes.subarray(12, 16).toString("ascii");
  if (chunkType !== "VP8L" || bytes.readUInt8(20) !== 0x2f) {
    throw new TypeError("Expected a lossless WebP sprite asset.");
  }
  const byte1 = bytes.readUInt8(21);
  const byte2 = bytes.readUInt8(22);
  const byte3 = bytes.readUInt8(23);
  const byte4 = bytes.readUInt8(24);
  return {
    height: 1 + (((byte2 >> 6) | (byte3 << 2) | (byte4 << 10)) & 0x3fff),
    width: 1 + ((byte1 | (byte2 << 8)) & 0x3fff),
  };
}
