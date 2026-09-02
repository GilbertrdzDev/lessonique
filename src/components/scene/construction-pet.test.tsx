import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CONSTRUCTION_PET_FRAME_COUNT,
  CONSTRUCTION_PET_FRAME_DURATIONS_MS,
  CONSTRUCTION_PET_SPRITE_SRC,
  ConstructionPet,
} from "./construction-pet";

describe("ConstructionPet", () => {
  it("renders one isolated 4-by-4 sprite surface", () => {
    const html = renderToStaticMarkup(
      <ConstructionPet builderStep={2} reducedMotion={false} />,
    );

    expect(html).toContain('data-slot="construction-pet"');
    expect(html).toContain('data-builder-step="2"');
    expect(html).toContain('data-frame-count="16"');
    expect(html).toContain('data-animation-mode="loop"');
    expect(html).not.toContain("<img");
    expect((html.match(/<span/gu) ?? [])).toHaveLength(1);
  });

  it("keeps reduced motion on the representative static frame", () => {
    const html = renderToStaticMarkup(
      <ConstructionPet builderStep={1} reducedMotion />,
    );

    expect(html).toContain('data-animation-mode="static"');
    expect(html).toContain('data-sprite-frame="0"');
  });

  it("declares a complete, naturally timed 16-frame cycle", () => {
    expect(CONSTRUCTION_PET_FRAME_COUNT).toBe(16);
    expect(CONSTRUCTION_PET_FRAME_DURATIONS_MS).toHaveLength(16);
    expect(new Set(CONSTRUCTION_PET_FRAME_DURATIONS_MS).size).toBeGreaterThan(8);
    expect(CONSTRUCTION_PET_FRAME_DURATIONS_MS[0]).toBeGreaterThan(
      CONSTRUCTION_PET_FRAME_DURATIONS_MS[6],
    );
    expect(CONSTRUCTION_PET_FRAME_DURATIONS_MS[8]).toBeGreaterThan(
      CONSTRUCTION_PET_FRAME_DURATIONS_MS[6],
    );
  });

  it("ships one bounded WebP sprite asset", () => {
    const path = join(
      process.cwd(),
      "public",
      CONSTRUCTION_PET_SPRITE_SRC.slice(1),
    );
    const bytes = readFileSync(path);
    const dimensions = readLosslessWebPDimensions(bytes);

    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");
    expect(dimensions).toEqual({ height: 1_280, width: 1_448 });
    expect(dimensions.width / 4).toBe(362);
    expect(dimensions.height / 4).toBe(320);
    expect(statSync(path).size).toBeLessThan(850_000);
  });

  it("clips one responsive cell without interpolating neighboring frames", () => {
    const stylesheet = readFileSync(
      join(process.cwd(), "src", "components", "scene", "construction-pet.module.css"),
      "utf8",
    ).replace(/\s+/gu, " ");

    expect(stylesheet).toContain("aspect-ratio: 362 / 320");
    expect(stylesheet).toContain("overflow: hidden");
    expect(stylesheet).toContain("background-size: 400% 400%");
    expect(stylesheet).toContain("construction-pet-sprite.webp");
  });
});

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
